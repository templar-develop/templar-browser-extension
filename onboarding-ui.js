const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function renderAuthChoice(backAttribute = '') {
  const methods = [
    ['link', 'link', 'Ссылка подписки', 'Та же ссылка, которую вы добавляете в Happ'],
    ['email', 'user', 'Личный кабинет', 'Email и пароль от вашего аккаунта'],
    ['telegram', 'telegram', 'Telegram', 'Подтверждение входа через нашего бота'],
  ];
  return `<section class="onboarding auth-choice">
    ${backAttribute ? `<button class="back-button" ${backAttribute}>${icon('chevron')} Назад</button>` : ''}
    <div class="onboarding-emblem">${icon('user')}</div>
    <h2>Как вам удобнее войти?</h2>
    <p class="field-help">Выберите способ подключения вашей подписки.</p>
    <div class="auth-methods">${methods.map(([id, symbol, title, description]) => `<button class="settings-row auth-method" data-auth-choice="${id}">${icon(symbol)}<span><strong>${title}</strong><small>${description}</small></span>${icon('chevron')}</button>`).join('')}</div>
    <p class="field-help auth-choice-note">Все способы открывают доступ к вашей подписке Templar VPN.</p>
  </section>`;
}
