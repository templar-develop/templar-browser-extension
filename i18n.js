// Offline RU/EN UI copy. No translation service or network access.
const english = new Map(Object.entries({
  'Задержка HTTPS до сайта через VPN': 'HTTPS site latency through VPN',
  'Задержка HTTPS до www.gstatic.com через каждую локацию. Проверка идёт параллельно и не прерывает VPN.': 'HTTPS latency to www.gstatic.com through each location. Checks run in parallel without interrupting the VPN.',
  'Автовыбор сравнивает задержку HTTPS до сайта через основные серверы и подключает самый быстрый доступный.': 'Auto compares HTTPS site latency through the primary servers and connects to the fastest available one.',
  'Да. Измеряется запрос HTTPS до www.gstatic.com через выбранный VLESS-профиль. TCP и XHTTP проверяются отдельно. Это не ICMP-пинг.': 'Yes. This measures an HTTPS request to www.gstatic.com through the selected VLESS profile. TCP and XHTTP are tested separately. This is not ICMP ping.',
  'Данные и подключение': 'Data and connection', 'Локальный стенд': 'Local fixture',
  'Задержка до шлюза каждой локации. Проверка не прерывает VPN. Скорость через VPN — в спидтесте.': 'Latency to each location gateway. The check keeps your VPN connected. VPN throughput is measured in the speed test.',
  'Задержка до шлюза': 'Gateway latency', 'Измеряем задержку': 'Measuring latency',
  'Остановить проверку': 'Stop test', 'Восстанавливаем вход…': 'Restoring sign-in…',
  'Восстановить сохранённый вход': 'Restore saved sign-in', 'Показать диагностику': 'Show diagnostics',
  'Диагностика подключения': 'Connection diagnostics',
  'Автовыбор сравнивает задержку до региональных шлюзов и подключает ближайший доступный основной сервер.': 'Auto compares regional gateway latency and connects to the closest available primary server.',
  'Да. Это задержка HTTPS до шлюза выбранной локации, а не ICMP-пинг. Скорость и задержку через VPN можно проверить спидтестом.': 'Yes. This is HTTPS latency to the location gateway, not ICMP ping. Use the speed test to measure throughput and latency through the VPN.',

  'Идёт замер скорости': 'Speed test in progress',
  'Обновить пинг': 'Refresh ping', 'Измеряем…': 'Measuring…',
  'Задержка HTTPS через каждую локацию. На время проверки маршруты переключаются; затем вернётся ваше подключение.': 'HTTPS latency through each location. Routes switch during the check; your connection is then restored.',
  'Задержка HTTPS через VPN': 'HTTPS latency through VPN',
  'Обычно 15–35 секунд, до 171 МБ трафика.': 'Usually 15–35 seconds, up to 171 MB of traffic.',
  'Проверьте email и пароль от личного кабинета.': 'Check your account email and password.',
  'Сначала подтвердите email в личном кабинете.': 'Verify your email in your account first.',
  'Достигнут лимит устройств. Удалите ненужное устройство в личном кабинете и повторите вход.': 'Device limit reached. Remove an unused device in your account and try again.',
  'Не удалось выбрать активную подписку. Войдите по её ссылке из личного кабинета.': 'Could not select an active subscription. Use its subscription link from your account.',
  'Время входа через Telegram истекло. Откройте бота заново.': 'Telegram sign-in expired. Open the bot again.',
  'Замер слишком короткий. Повторите проверку.': 'The measurement was too short. Run it again.',
  'Проверка будет идти через выбранную локацию VPN и расходовать трафик подписки. Четыре потока, прогрев соединений. Задержка — HTTPS до Cloudflare; результат может отличаться от других тестовых серверов.': 'The test uses your selected VPN location and subscription traffic. Four streams with connection warm-up. Latency is HTTPS to Cloudflare; other test servers may give different results.',

  'Добро пожаловать в Templar VPN': 'Welcome to Templar VPN', 'Расширение подключает только браузер и сохраняет выбранную локацию.': 'The extension connects only your browser and keeps your selected location.', 'Далее': 'Next',
  'Настроим расширение': 'Set up the extension', 'По умолчанию: русский язык и тёмная тема.': 'Default: Russian language and dark theme.', 'Продолжить': 'Continue',
  'Нужны российские сервисы?': 'Do you need Russian services?', 'Если включить, российские домены и сервисы будут идти по настроенному российскому маршруту.': 'When enabled, Russian domains and services use the configured Russian route.', 'Да, нужны': 'Yes, I need them', 'Нет, не нужны': 'No, I do not need them', 'Изменить это можно позже в настройках.': 'You can change this later in Settings.',
  'Российские сервисы через VPN': 'Russian services through VPN', 'Да': 'Yes', 'Нет': 'No', 'Да — через VPN. Нет — напрямую, через вашего провайдера.': 'Yes — through the VPN. No — directly through your provider.', 'Позже: Настройки → Маршрутизация → Российские сервисы через VPN.': 'Later: Settings → Routing → Russian services through VPN.', 'Да — российские сервисы используют VPN по выбранным ниже правилам. Нет — открываются напрямую через вашего провайдера, даже если включён VPN.': 'Yes — Russian services use the VPN under the rules below. No — they open directly through your provider even when the VPN is on.', 'Если банк или другой российский сервис не открывается с VPN, попробуйте выбрать «Нет». Остальные сайты продолжат работать по вашим правилам.': 'If a bank or another Russian service does not open through the VPN, try “No”. Other sites keep following your rules.',
  'Как вам удобнее войти?': 'How would you like to sign in?', 'Выберите способ подключения вашей подписки.': 'Choose how to connect your subscription.', 'Все способы открывают доступ к вашей подписке Templar VPN.': 'Each option gives access to your Templar VPN subscription.', 'Способы входа': 'Sign-in methods', 'Ссылка подписки': 'Subscription link', 'Та же ссылка, которую вы добавляете в Happ': 'The same link you add to Happ', 'Email и пароль от вашего аккаунта': 'Your account email and password', 'Подтверждение входа через нашего бота': 'Confirm sign-in through our bot',
  'Российские сервисы': 'Russian services', 'Маршрут российских сервисов': 'Russian services route', 'Российские сайты через российский маршрут': 'Russian sites through the Russian route', 'Российские сайты через обычный маршрут': 'Russian sites through the normal route', 'Маршрут пока не выбран': 'Route not selected yet', 'Включить российский маршрут': 'Enable Russian route', 'Выключить российский маршрут': 'Disable Russian route', 'Включены': 'Enabled', 'Отключены': 'Disabled', 'Не выбрано': 'Not selected', 'переключить': 'toggle', 'Докупить устройства': 'Buy more devices', 'устройств': 'devices',
  'Низкая нагрузка': 'Low load', 'Средняя нагрузка': 'Medium load', 'Высокая нагрузка': 'High load',
  'Москва [Youtube без рекламы]': 'Moscow [YouTube ad-free]', 'Швейцария — Дополнительный': 'Switzerland — Additional', 'Швеция — Дополнительный': 'Sweden — Additional', 'Нидерланды — Дополнительный': 'Netherlands — Additional',
  'Последний замер:': 'Last measured:', 'Тестовая сборка · 0.3.4': 'Development build · 0.3.4', '0.3.4 · тестовая сборка': '0.3.4 · development build',
  'Проверка скорости': 'Speed test', 'Загрузка, отдача и задержка': 'Download, upload and latency',
  'Узнайте, как работает ваше подключение.': 'See how your connection performs.',
  'Выбранная локация': 'Selected location', 'Скорость ещё не измерена': 'Speed has not been measured yet',
  'Мбит/с': 'Mbps', 'Нет замера': 'Not measured', 'Результаты проверки': 'Test results',
  'Загрузка': 'Download', 'Отдача': 'Upload', 'Задержка': 'Latency',
  'Запустить проверку': 'Start test', 'Сервер проверки ещё не подключён.': 'The test server is not connected yet.',
  'В макете замер пока недоступен.': 'Measurement is not available in this prototype yet.',
  'Проверка будет идти через выбранную локацию VPN и расходовать трафик подписки. Результаты не сохраняются.': 'The test will use the selected VPN location and count towards your subscription traffic. Results are not saved.',
  'Настройки': 'Settings', 'Сделайте подключение своим.': 'Make this connection yours.',
  'Сайт': 'Website', 'Telegram-бот': 'Telegram bot', 'Ссылки Templar VPN': 'Templar VPN links',
  'Сервер расширения ещё не подключён. Это тестовая сборка этапа 3.1.': 'The extension server is not connected yet. This is a stage 3.1 development build.',
  'Откройте эту сборку как расширение. Настройки браузера не изменены.': 'Open this build as an extension. Browser settings are unchanged.',
  'Тестовая сборка · 0.2.0': 'Development build · 0.2.0', 'Трафик заблокирован': 'Traffic blocked',
  'Правила применяются к новым запросам при активном VPN.': 'Rules apply to new requests while the VPN is active.',
  '0.2.0 · тестовая сборка': '0.2.0 · development build',
  '0.3.0 · тестовая сборка': '0.3.0 · development build',
  'Тестовая сборка · 0.3.0': 'Development build · 0.3.0',
  'Тестовая сборка. Для подключения требуется активная подписка Templar VPN.': 'Development build. An active Templar VPN subscription is required to connect.',
  'Используйте данные своего аккаунта Templar VPN.': 'Use your Templar VPN account credentials.',
  'Автовыбор сравнивает основные серверы по задержке HTTPS-запросов через VPN.': 'Auto compares the primary servers by HTTPS request latency through the VPN.',
  'Да. Автовыбор измеряет время HTTPS-запроса через каждый доступный основной сервер. Это задержка запроса, а не ICMP-пинг.': 'Yes. Auto measures an HTTPS request through each available primary server. This is request latency, not ICMP ping.', 'Подписка': 'Subscription',
  'Пинг ещё не измерен': 'Ping has not been measured', 'Подключение требует восстановления': 'Connection recovery is required', 'Восстановить подключение': 'Restore connection', 'Восстановить': 'Restore',
  'Замер пинга пока недоступен. Можно подключиться без него.': 'Ping is currently unavailable. You can connect without it.',
  'Отключить VPN': 'Disconnect VPN',
  'Тестовая сборка этапа 3.1. Для подключения требуется подготовленный сервер расширения.': 'Stage 3.1 development build. A prepared extension server is required to connect.',
  'Данные входа передаются только сервису Templar VPN. Пароли и история посещений не сохраняются. Настройки остаются локально.': 'Sign-in data is sent only to Templar VPN. Passwords and browsing history are not stored. Settings stay local.',
  'Проверка уже выполняется. Дождитесь завершения или остановите её.': 'A test is already running. Wait for it to finish or stop it.',
  'Сервис недоступен. Попробуйте ещё раз.': 'Service unavailable. Please try again.',
  'Подписка неактивна или требуется повторный вход.': 'Subscription inactive or sign-in required.',
  'Слишком много попыток. Попробуйте позже.': 'Too many attempts. Please try later.',
  'Не удалось подтвердить ответ сервера.': 'Could not verify the server response.',
  'Не удалось подтвердить защищённое подключение.': 'Could not verify the secure connection.',
  'Эта локация недоступна для подписки.': 'This location is unavailable for your subscription.',
  'Проверьте ссылку подписки Templar VPN.': 'Check your Templar VPN subscription link.',
  'Введите Email и пароль от кабинета.': 'Enter your account email and password.',
  'Проверьте правила доменов.': 'Check the domain rules.',
  'Настройки подключения заняты другим расширением или политикой браузера.': 'Connection settings are controlled by another extension or browser policy.',
  'Поддержка': 'Support', 'Поможем с подпиской и подключением.': 'Help with your subscription and connection.',
  'Telegram и электронная почта': 'Telegram and email', 'Контакты поддержки': 'Support contacts', 'Не нашли ответ?': 'Still need help?',
  'Укажите устройство, браузер и локацию. Не отправляйте пароль или ссылку подписки.': 'Include your device, browser and location. Do not send your password or subscription link.',
  'Маршрутизация': 'Routing', 'Все сайты': 'All websites', 'Кроме выбранных': 'Except listed', 'Только выбранные': 'Listed only',
  'Язык': 'Language', 'Язык интерфейса': 'Interface language', 'Оформление': 'Appearance', 'Тема оформления': 'Color theme',
  'Русский': 'Русский', 'Тёмная': 'Dark', 'Светлая': 'Light', 'Вопросы и ответы': 'FAQ', 'Коротко о главном': 'The essentials',
  'О приложении': 'About', 'Templar VPN для браузера': 'Templar VPN for your browser', 'Назад': 'Back',
  'Выберите, какие сайты идут через VPN.': 'Choose which websites use the VPN.', 'Режим маршрутизации': 'Routing mode',
  'Весь браузер через VPN': 'All browser traffic through the VPN', 'Домены из списка — без VPN': 'Listed domains bypass the VPN',
  'VPN только для доменов из списка': 'Use the VPN only for listed domains', 'Домен': 'Domain', 'Добавить': 'Add',
  'Без https:// и пути. Поддомены включаются автоматически.': 'No https:// or path. Subdomains are included automatically.',
  'Список доменов': 'Domain list', 'Список пуст — VPN не применяется к сайтам.': 'The list is empty — websites bypass the VPN.',
  'Список пуст — все сайты идут через VPN.': 'The list is empty — all websites use the VPN.',
  'Сохранённый список доменов не применяется в этом режиме.': 'Your saved domain list is not used in this mode.',
  'Демо: правила сохраняются локально, но к реальному трафику пока не применяются.': 'Demo: rules are saved locally but do not affect real traffic yet.',
  'Введите домен, например example.com, без протокола и пути.': 'Enter a domain such as example.com, without a protocol or path.',
  'Этот домен уже есть в списке.': 'This domain is already on the list.', 'Можно добавить до 100 доменов.': 'You can add up to 100 domains.',
  'Настройки сохранены.': 'Settings saved.', 'Домен добавлен.': 'Domain added.', 'Домен удалён.': 'Domain removed.',
  'Хранилище недоступно. Настройки действуют до закрытия макета.': 'Storage is unavailable. These settings last until you close the demo.',
  'Всё, что нужно для начала.': 'Everything you need to get started.', 'Что подключается к VPN?': 'What uses the VPN?',
  'Только браузер, в котором установлено расширение. Остальные приложения используют обычное подключение.': 'Only the browser where the extension is installed. Other apps keep their normal connection.',
  'Как добавить свою подписку?': 'How do I add my subscription?',
  'Вставьте ссылку подписки или войдите через личный кабинет либо Telegram. В макете используйте только демонстрационные данные.': 'Paste your subscription link or sign in with your account or Telegram. Use demo data only in this prototype.',
  'Что делает автовыбор?': 'What does Auto-select do?',
  'Выбирает самый быстрый доступный сервер. Выбранная вручную страна сама не меняется. В макете выбор и пинг демонстрационные.': 'Chooses the fastest available server. A manually selected country stays selected. Selection and ping are simulated in this demo.',
  'Как работают правила доменов?': 'How do domain rules work?',
  '«Кроме выбранных» исключает домены из VPN. «Только выбранные» направляет через VPN только перечисленные домены. Правило включает сам домен и его поддомены.': '“Except listed” bypasses the VPN for listed domains. “Listed only” uses the VPN only for listed domains. Each rule includes the domain and its subdomains.',
  'Пинг уже настоящий?': 'Is the ping real yet?',
  'Пока нет. Сейчас показываются тестовые значения. Реальные замеры через подключение появятся на следующем этапе.': 'Not yet. The displayed values are simulated. Real measurements through the connection are planned for the next stage.',
  'Как заменить ссылку или выйти?': 'How do I replace my link or sign out?',
  'На главном экране нажмите «Заменить ссылку» или «Выйти». При отмене замены текущая подписка остаётся.': 'Use “Replace link” or “Sign out” on the home screen. Cancelling a replacement keeps your current subscription.',
  'Что делать, если подписка закончилась?': 'What if my subscription has expired?',
  'Продлите подписку в кабинете или боте, затем обновите её в расширении. Обновление само по себе не продлевает срок.': 'Renew in your account or the bot, then refresh the subscription in the extension. Refreshing does not renew it.',
  'Версия': 'Version', '0.1.0 · демо': '0.1.0 · demo', 'Свобода в один клик.': 'Freedom in one click.',
  'Расширение для Chrome и Firefox.': 'An extension for Chrome and Firefox.', 'Ваша подписка — только для браузера.': 'Your subscription, just for your browser.',
  'Сайт Templar VPN': 'Templar VPN website', 'Исходный код на GitHub': 'Source code on GitHub', 'Конфиденциальность': 'Privacy',
  'Этот макет не отправляет данные, не сохраняет пароли и не собирает историю посещений. Локально сохраняются настройки и выбранная локация.': 'This prototype sends no data, stores no passwords and collects no browsing history. Settings and your selected location are saved locally.',
  'Текущий этап': 'Current stage', 'Интерактивный интерфейс. Подключение, вход и пинг демонстрационные; рабочая сеть не меняется.': 'Interactive UI. Connection, sign-in and ping are simulated; your network settings stay unchanged.',
  'Флаги:': 'Flags:', ', Twitter и другие авторы ·': ', Twitter and other contributors ·',
  'Только для браузера': 'Browser only', 'ДЕМО': 'DEMO', 'соединение не меняется': 'connection is unchanged',
  'Не подключено': 'Disconnected', 'Подключено': 'Connected', 'Подключение': 'Connecting', 'Ошибка подключения': 'Connection error',
  'Подключаем…': 'Connecting…', 'Не удалось подключиться': 'Could not connect', 'Готовы к подключению': 'Ready to connect',
  'Выбираем самый быстрый сервер': 'Choosing the fastest server', 'Настраиваем выбранную локацию': 'Setting up your location',
  'Остальные приложения — без изменений': 'Other apps stay unchanged', 'Выбранная локация временно недоступна': 'This location is temporarily unavailable',
  'Одно нажатие — и вы в сети': 'One click and you are online', 'ЛОКАЦИЯ': 'LOCATION', 'Выбрана вручную': 'Selected manually',
  'Автовыбор': 'Auto-select', 'Москва': 'Moscow', 'Швейцария': 'Switzerland', 'Швеция': 'Sweden', 'Нидерланды': 'Netherlands',
  'Выбирает самый быстрый сервер': 'Chooses the fastest server', 'Базовый': 'Basic', 'Трафик безлимитный': 'Unlimited traffic',
  'Обновляем…': 'Refreshing…', 'Обновить подписку': 'Refresh subscription', 'Заменить ссылку': 'Replace link', 'Выйти': 'Sign out', 'мс': 'ms', 'демо': 'demo',
  'Другую страну не включаем автоматически. Можно повторить попытку или выбрать локацию.': 'We do not switch countries automatically. Retry or choose a location.',
  'По ссылке': 'Link', 'Личный кабинет': 'Account', 'Способ входа': 'Sign-in method', 'Войдите в кабинет.': 'Sign in to your account.',
  'Вход через Telegram.': 'Sign in with Telegram.', 'Всё начинается': 'It all starts', 'с вашей подписки.': 'with your subscription.',
  'Email и пароль от вашего личного кабинета.': 'Your account email and password.', 'В макете используйте только демоданные.': 'Use demo credentials in this prototype.',
  'Подписка из Telegram появится здесь': 'Your Telegram subscription will appear here', 'после подтверждения входа.': 'after you confirm sign-in.',
  'Добавьте ссылку Templar VPN.': 'Add your Templar VPN link.', 'Ту же, которой пользуетесь в Happ.': 'The same one you use in Happ.',
  'Демо · данные не сохраняются и не отправляются': 'Demo · credentials are not stored or sent', 'Ссылка подписки': 'Subscription link',
  'В макете используйте тестовую ссылку.': 'Use a test link in this prototype.', 'Настоящая подписка не нужна.': 'You do not need a real subscription.',
  'Проверяем в демо…': 'Checking in demo…', 'Добавить подписку': 'Add subscription', 'Попробовать на примере': 'Try an example',
  'Пароль': 'Password', 'Пароль от кабинета': 'Account password', 'Для макета:': 'For this demo:', 'Пароль:': 'Password:',
  'Настоящие логин и пароль здесь не нужны.': 'You do not need your real credentials here.', 'Входим в демо…': 'Signing in to demo…',
  'Войти': 'Sign in', 'Войти с демоаккаунтом': 'Use the demo account', 'Ожидаем подтверждения входа.': 'Waiting for sign-in confirmation.',
  'Это демонстрация: Telegram не открывался.': 'This is a demo: Telegram was not opened.', 'Подтвердить вход в демо': 'Confirm demo sign-in',
  'Отменить': 'Cancel', 'В рабочей версии откроется наш Telegram-бот. Пароль и код из Telegram вводить здесь не потребуется.': 'The working version will open our Telegram bot. You will not need to enter a Telegram password or code here.',
  'Войти через Telegram': 'Sign in with Telegram', 'Сейчас кнопка покажет только макет подтверждения.': 'For now, this button previews the confirmation screen.',
  'Ваша точка подключения.': 'Your connection location.', 'Выберите страну или доверьтесь автовыбору.': 'Choose a country or let Auto-select decide.',
  'В макете все подключения тестовые.': 'All connections in this prototype are simulated.', 'ЗАДЕРЖКА В ДЕМО': 'DEMO LATENCY',
  'Идёт замер скорости': 'Speed test in progress',
  'Обновить пинг': 'Refresh ping', 'Локации': 'Locations', 'Низкая нагрузка': 'Low load', 'Средняя нагрузка': 'Medium load',
  'Выбор сохраняется. При обновлении подписки локация сама не переключается.': 'Your choice is saved. Refreshing the subscription does not change your location.',
  'Подписка закончилась': 'Subscription expired', 'Подключение занято': 'Connection settings in use',
  'Продлите подписку и вернитесь сюда.': 'Renew your subscription and return here.', 'Ваш выбор локации сохранится.': 'Your selected location will be kept.',
  'Настройки прокси контролирует другое': 'Proxy settings are controlled by another', 'расширение или политика браузера.': 'extension or browser policy.',
  'Доступ завершился': 'Access ended', 'Выбранная локация': 'Selected location', 'Продлить подписку': 'Renew subscription', 'Проверить ещё раз': 'Check again',
  'Я уже продлил': 'I have renewed', 'Как освободить подключение': 'How to release the connection', 'Доступ отключён': 'Access disabled',
  'Прокси-настройки не изменены': 'Proxy settings are unchanged', '· демонстрация': '· demo', 'Закрыть': 'Close', 'О прототипе': 'About this prototype',
  'Нужна HTTPS-ссылка подписки Templar VPN. Можно нажать «Попробовать на примере».': 'Enter an HTTPS Templar VPN subscription link or use “Try an example”.',
  'Добавлена тестовая подписка. Настоящие данные не проверялись.': 'Test subscription added. Real credentials were not checked.',
  'Демонстрационное подключение отключено.': 'Demo connection disconnected.', 'Демонстрация подключения. Настройки браузера не изменились.': 'Simulated connection. Browser settings are unchanged.',
  'В макете работают только указанные демоданные. Настоящий аккаунт не проверялся.': 'Only the displayed demo credentials work here. Your real account was not checked.',
  'Демовход через Telegram завершён. Настоящий аккаунт не использовался.': 'Demo Telegram sign-in complete. No real account was used.',
  'Демовход в кабинет завершён. Настоящий аккаунт не проверялся.': 'Demo account sign-in complete. No real account was checked.',
  'В демо подписка по-прежнему истекла. Для просмотра выберите состояние «Отключено».': 'The demo subscription is still expired. Select “Disconnected” to preview an active subscription.',
  'Тестовые данные обновлены. Выбранная локация сохранена.': 'Demo data refreshed. Your location is kept.',
  'Показаны демонстрационные значения пинга. Запросы к серверам не отправлялись.': 'Showing simulated ping values. No requests were sent to the servers.',
  'Новая локация выбрана. Нажмите кнопку подключения.': 'New location selected. Press the connect button.',
  'Выйти из демоаккаунта?': 'Sign out of the demo account?', 'Выйти из подписки?': 'Sign out of this subscription?',
  'Тестовое подключение отключится, и откроется экран входа. Настоящая подписка останется без изменений.': 'The demo connection will stop and sign-in will open. Your real subscription is unchanged.',
  'Остаться': 'Stay signed in', 'Вы вышли из макета. Можно добавить другую подписку или войти в аккаунт.': 'Signed out of the demo. Add another subscription or sign in to an account.',
  'Текущая подписка останется, пока вы не добавите новую. После замены подключитесь заново.': 'Your current subscription stays until you add a new one. Reconnect after replacing it.',
  'Новая ссылка подписки': 'New subscription link', 'В макете используйте тестовую ссылку. Данные никуда не отправляются.': 'Use a test link in this prototype. No data is sent.',
  'Отмена': 'Cancel', 'Нужна HTTPS-ссылка Templar VPN. Текущая подписка не изменена.': 'Enter an HTTPS Templar VPN link. Your current subscription is unchanged.',
  'Заменяем в демо…': 'Replacing in demo…', 'Тестовая ссылка заменена. Локация сохранена — подключитесь заново.': 'Test link replaced. Your location is kept — reconnect to continue.',
  'В рабочей версии здесь откроется покупка подписки в кабинете Templar VPN.': 'The working version will open subscription checkout in your Templar VPN account.',
  'Тестовый конфликт ещё активен. Для просмотра выберите состояние «Отключено».': 'The demo conflict is still active. Select “Disconnected” to preview the connection.',
  'Отключите другое прокси-расширение. Если браузером управляет организация, обратитесь к администратору.': 'Disable the other proxy extension. If your browser is managed by an organization, contact your administrator.',
  'Этап 02': 'Stage 02', 'Интерфейс': 'Interface', 'ВАШ VPN. ТЕПЕРЬ В БРАУЗЕРЕ.': 'YOUR VPN. NOW IN YOUR BROWSER.',
  'Свобода': 'Freedom', 'в': 'in', 'один клик.': 'one click.', 'Ваша подписка Templar VPN —': 'Your Templar VPN subscription —',
  'в простом расширении для браузера.': 'in a simple browser extension.', 'На компьютере': 'For desktop', 'Войдите удобным способом': 'Sign in your way',
  'Ссылка подписки, кабинет или Telegram.': 'Subscription link, account or Telegram.', 'Выберите локацию': 'Choose a location',
  'Ваша страна останется выбранной.': 'Your country stays selected.', 'Подключите браузер': 'Connect your browser',
  'Остальные приложения работают как обычно.': 'Your other apps work as usual.', 'Это интерактивный макет.': 'This is an interactive prototype.',
  'Данные тестовые. Соединение не меняется.': 'Simulated data. Your connection stays unchanged.', 'ОКНО РАСШИРЕНИЯ': 'EXTENSION WINDOW',
  'Можно нажимать': 'Try the controls', 'Новая вкладка': 'New tab', 'ПОСМОТРЕТЬ СОСТОЯНИЕ': 'PREVIEW A STATE', 'Добавление': 'Add subscription',
  'Вход в ЛК': 'Account sign-in', 'Отключено': 'Disconnected', 'Истекла': 'Expired', 'Ошибка': 'Error', 'Конфликт': 'Conflict',
  'Сначала дизайн. Затем подключение.': 'Design first. Connection next.', 'Состояния прототипа': 'Prototype states',
  'Планируемые браузеры': 'Planned browsers', 'ЭТАП 02 / ИНТЕРФЕЙС': 'STAGE 02 / INTERFACE', 'Знакомьтесь,': 'Meet',
  'Templar для браузера.': 'Templar for your browser.',
  'Здесь можно проверить добавление подписки, выбор локации и состояния окна. Все подключения и даты демонстрационные.': 'Try adding a subscription, choosing locations and switching UI states. Connections and dates are simulated.',
  'Макет не обращается к серверам, не сохраняет ссылку подписки и не меняет настройки браузера. Для просмотра не нужна настоящая ссылка.': 'This prototype does not contact servers, store your subscription link or change browser settings. You do not need a real link.',
  'Понятно': 'Got it',
}));

let locale = 'ru';
const textSources = new WeakMap();
const attributeSources = new WeakMap();
export function getLocale() { return locale; }

export function translateText(value) {
  if (locale === 'ru') return value;
  const trimmed = value.trim();
  let translated = english.get(trimmed);
  if (!translated && /[А-Яа-яЁё]/.test(trimmed)) {
    translated = trimmed
      .replace(/^до /, 'until ').replace(/^Сейчас: /, 'Current: ')
      .replace(/^Выбрать локацию, сейчас /, 'Choose location, current: ')
      .replace(/^Подключить браузер$/, 'Connect browser').replace(/^Отключить браузер$/, 'Disconnect browser')
      .replace(/^Удалить домен /, 'Remove domain ').replace(/^Демонстрационный пинг: /, 'Demo ping: ')
      .replace(/демонстрационный пинг /g, 'demo ping ').replace(/самый быстрый сервер/g, 'fastest server')
      .replace(/миллисекунд/g, 'milliseconds').replace(/обновляется/g, 'refreshing').replace(/ мс\b/g, ' ms')
      .replace(/Автовыбор/g, 'Auto-select').replace(/Москва/g, 'Moscow').replace(/Швейцария/g, 'Switzerland')
      .replace(/Швеция/g, 'Sweden').replace(/Нидерланды/g, 'Netherlands')
      .replace(/Дополнительный/g, 'Additional').replace(/без рекламы/g, 'ad-free')
      .replace(/Прототип расширения Templar VPN/g, 'Templar VPN extension prototype')
      .replace(/Templar VPN, прототип расширения/g, 'Templar VPN, extension prototype');
  }
  return translated === undefined ? value : value.replace(trimmed, translated);
}

function localizeElement(element) {
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    if (!element.hasAttribute?.(attribute)) continue;
    const sources = attributeSources.get(element) || {};
    const value = element.getAttribute(attribute);
    const record = sources[attribute];
    const source = record && value === record.output ? record.source : value;
    const output = translateText(source);
    sources[attribute] = { source, output };
    attributeSources.set(element, sources);
    if (value !== output) element.setAttribute(attribute, output);
  }
}

function localize(root) {
  if (root.nodeType === Node.ELEMENT_NODE) localizeElement(root);
  if (root.querySelectorAll) root.querySelectorAll('[aria-label],[title],[placeholder]').forEach(localizeElement);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = root.nodeType === Node.TEXT_NODE ? [root] : [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  for (const node of nodes) {
    if (['SCRIPT', 'STYLE', 'CODE'].includes(node.parentElement?.tagName) || !node.nodeValue.trim()) continue;
    const record = textSources.get(node);
    const source = record && node.nodeValue === record.output ? record.source : node.nodeValue;
    const output = translateText(source);
    textSources.set(node, { source, output });
    if (node.nodeValue !== output) node.nodeValue = output;
  }
}

export function setLocale(value) {
  locale = value === 'en' ? 'en' : 'ru';
  document.documentElement.lang = locale;
  document.title = locale === 'en' ? 'Templar VPN — browser extension' : 'Templar VPN — расширение для браузера';
  localize(document.body);
}

export function startLocalization(value) {
  setLocale(value);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(localize);
      else localize(record.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}
