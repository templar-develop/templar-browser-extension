"""Native unpacked Chrome reload, confined to the caller's isolated test profile."""
from selenium.webdriver.support.ui import WebDriverWait


def reload_chrome_extension(driver, popup):
    extension_id = popup.split('/')[2]
    driver.switch_to.new_window('tab')
    driver.get('chrome://extensions/')
    manager = driver.current_window_handle

    def element(tag, selector, own_id=None):
        return driver.execute_script('''
          const [tag,selector,id]=arguments;
          function find(root) {
            for (const node of root.querySelectorAll('*')) {
              if (node.localName===tag && (!id || node.id===id)) return node.shadowRoot.querySelector(selector);
              if (node.shadowRoot) { const match=find(node.shadowRoot); if (match) return match; }
            }
            return null;
          }
          return find(document);
        ''', tag, selector, own_id)

    # --load-extension can initially run without this preference. A genuine
    # Reload then disables it as unsupportedDeveloperExtension unless enabled.
    toggle = WebDriverWait(driver, 15).until(lambda d: element('extensions-toolbar', '#devMode'))
    if not driver.execute_script('return arguments[0].checked', toggle):
        toggle.click()
    WebDriverWait(driver, 10).until(lambda d: driver.execute_script('return arguments[0].checked', toggle))
    reload_button = WebDriverWait(driver, 15).until(lambda d: element('extensions-item', '#dev-reload-button', extension_id))
    assert reload_button.is_displayed() and reload_button.is_enabled()
    def worker_ids():
        return {t['targetId'] for t in driver.execute_cdp_cmd('Target.getTargets', {})['targetInfos']
                if t['type'] == 'service_worker' and t['url'].startswith('chrome-extension://' + extension_id + '/')}
    previous_workers = worker_ids()
    reload_button.click()
    # Reload destroys old extension pages. Reopen from the surviving manager,
    # rather than reusing its closed WebDriver window or declaring an update
    # passed merely because the replacement manifest is visible on disk.
    driver.switch_to.window(manager)
    WebDriverWait(driver, 20).until(lambda d: worker_ids() - previous_workers)
    driver.switch_to.new_window('tab')
    driver.get(popup)
