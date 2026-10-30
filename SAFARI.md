# Safari Web Extension: feasibility and implementation plan

Дата исследования: 28 октября 2026 года.

## Вывод

Интерфейс Templar можно переиспользовать в Safari Web Extension: Safari
поддерживает стандартный формат WebExtension, HTML/CSS/JavaScript и упаковку
существующего расширения через Xcode. Это покрывает окно расширения, локализацию,
настройки, список профилей, вход и запросы к API.

Текущий сетевой слой перенести в Safari Web Extension «как есть» нельзя. Он
использует `chrome.proxy.settings` для PAC в Chrome и `browser.proxy.onRequest`
в Firefox (`runtime/proxy-driver.js`). В официальной таблице совместимости Safari
нет API `proxy` и нет эквивалента этим двум API. Safari обычно игнорирует
неподдерживаемые разрешения и методы, поэтому расширение может установиться и
выглядеть рабочим, но не будет маршрутизировать трафик. Это должно быть отдельным
стоп-критерием, а не скрытым автоматическим переходом на прямое соединение.

Для настоящего VPN на macOS и iOS нужен нативный контейнер приложения с
`Network Extension`. Рекомендуемый вариант — `NEPacketTunnelProvider` с
собственным туннелем до браузерного шлюза. Он получает виртуальный интерфейс,
DNS-настройки и списки включаемых/исключаемых сетей; расширение Safari остаётся
UI и управляющим слоем. Для этого нужны App ID, entitlement
`com.apple.developer.networking.networkextension`, подпись Apple, согласие
пользователя на VPN-конфигурацию и отдельная проверка App Store.

Если принципиально нужно проксировать только Safari, одного WebExtension всё
равно недостаточно. На macOS можно отдельно исследовать
`NETransparentProxyProvider`: Apple допускает обработку или пропуск отдельных
потоков и выбор по приложению (эта возможность документирована начиная с
macOS 11). `NEAppProxyProvider` предназначен для flow-oriented per-app VPN, но
правила app-scoping и доступность entitlement зависят от платформы и режима
распространения; на iOS per-app правила обычно задаются управляемой
конфигурацией. Поэтому для обычной потребительской iOS-версии нельзя обещать
режим «только Safari» без отдельного прототипа и проверки entitlement. Надёжный
общий вариант — `NEPacketTunnelProvider` с явными маршрутами/исключениями, а не
попытка подменить `proxy` permission.

Официальные материалы Apple:

- [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
  — Safari 14+ на macOS и Safari 15+ на iOS, модель app extension и упаковка.
- [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
  — `xcrun safari-web-extension-packager`, предупреждения по manifest и создание
  Xcode-проекта.
- [Assessing your Safari web extension’s browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
  — перечень отличий manifest/API. В частности, `webRequestBlocking` не
  поддерживается, `webRequest` отсутствует на iOS, а неподдерживаемые API могут
  быть проигнорированы.
- [NEPacketTunnelProvider](https://developer.apple.com/documentation/networkextension/nepackettunnelprovider)
  — системный API пакетного туннеля и обязательное Network Extension entitlement.
- [Routing your VPN network traffic](https://developer.apple.com/documentation/networkextension/routing-your-vpn-network-traffic)
  — packet/app-scoped rules, включаемые и исключаемые маршруты.
- [NEAppProxyProvider](https://developer.apple.com/documentation/networkextension/neappproxyprovider)
  и [App proxy provider](https://developer.apple.com/documentation/networkextension/app-proxy-provider)
  — потоковый per-app вариант, который нужно проверять отдельно для macOS/iOS.
- [NETransparentProxyProvider](https://developer.apple.com/documentation/networkextension/netransparentproxyprovider)
  — вариант macOS для выбора и обработки отдельных потоков.
- [Optimizing your web extension for Safari](https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari)
  — non-persistent background/service worker, ограничения iOS и экономия памяти.

## Что уже совместимо

Следующие части можно оставить общими между Chrome, Firefox и Safari:

- `index.html`, `styles.css`, `site-brand.css`, `i18n.js`, `motion.js`;
- `profiles.js`, `preferences.js`, `settings-ui.js`, `speedtest-ui.js`;
- схема подписки и проверка входных данных в `runtime/api.js`;
- выдача профилей с разделением TCP/XHTTP, порядок Happ и статусы нагрузки;
- HTTPS API с ограниченной сессией, без cookies и журнала посещённых URL.

В Safari эти файлы должны войти в каталог `Resources` сгенерированного Xcode
target. Различия нужно держать в адаптере транспорта, а не в UI.

## Что нельзя переносить без переделки

| Возможность | Сейчас | Safari Web Extension | План |
| --- | --- | --- | --- |
| Перехват и маршрутизация запросов | Chrome PAC через `proxy.settings`; Firefox `proxy.onRequest` | Эквивалента нет; разрешение `proxy` нельзя считать рабочим | Реализовать туннель в `NEPacketTunnelProvider`; выбор профиля передавать через app group/IPC |
| HTTP-аутентификация шлюза | Chrome `webRequestAuthProvider` | В iOS `webRequest` отсутствует, общего auth-provider нет | Аутентификация внутри TLS-туннеля короткоживущим lease; не передавать пароль сайта |
| WebRTC/DNS защита | `privacy` API расширения | Нельзя полагаться на тот же API | Политики DNS и маршрутов задавать в Network Extension; проверить IPv4/IPv6, WebRTC и утечки отдельно |
| Фоновый процесс | MV3 service worker/Firefox background | iOS выгружает non-persistent background; `storage.session` только Safari 16.4+ | Service worker, `storage` для некритичных настроек, секреты — в Keychain контейнера |
| Разрешения сайтов | `<all_urls>` в текущих сборках | Safari показывает пользовательские разрешения, особенно для `<all_urls>` | Не добавлять content scripts; сократить host permissions до реально нужных API-origin, если это совместимо с выбранным туннелем |
| Автовыбор/ping | Пинг через браузерный прокси | WebExtension не сможет выполнить сетевой маршрут сама | Замер через нативный туннель или API-пробник, сохранять ручной выбор и не менять страну без явного Auto |
| Только Safari | В Chrome/Firefox это ограничивается прокси браузера | WebExtension не задаёт per-app VPN | На macOS изучить `NETransparentProxyProvider`; на iOS не обещать без проверки managed per-app правил; общий fallback — packet tunnel с маршрутами |

Текущий `runtime/proxy-driver.js` не следует включать в Safari target до
появления нативного транспорта. Удаление `proxy` из manifest само по себе не
создаёт VPN и не должно маскироваться статусом «Подключено».

## Предлагаемая структура Safari target

1. Скопировать текущие web-ресурсы в новый Safari Web Extension target командой
   `xcrun safari-web-extension-packager` и сразу проверить все предупреждения
   по manifest/API.
2. Добавить containing app на Swift для macOS и iOS. Оно отвечает за login,
   Keychain, App Group и управление `NETunnelProviderManager`.
3. Добавить Packet Tunnel Provider на Swift. Он устанавливает TLS-соединение с
   браузерным шлюзом, применяет выбранную политику маршрутов и закрывает туннель
   при истечении lease/подписки. Никакого fallback на `DIRECT`.
4. Оставить popup Safari тонким клиентом: `runtime.sendMessage` в containing app,
   отображение состояния и локаций, обновление статуса через безопасное событие.
5. Использовать один device-id на установку приложения, хранить его в Keychain,
   а серверу передавать только хэшированный идентификатор и текущую сессию. Не
   считать каждое открытие popup новым устройством.
6. Подготовить отдельные macOS/iOS подписи и entitlement. Для iOS добавить
   поддержку в Xcode через `--rebuild-project`; временная установка папки Safari
   годится только для UI-проверки на macOS и удаляется Safari после завершения
   сессии/выхода.

## Безопасность и критерии выпуска

- Не включать в Safari `proxy`, `webRequestAuthProvider`, `cookies`, `history` или
  content scripts, если конкретная функция их не требует.
- API и шлюз должны использовать TLS с обычной проверкой сертификата; lease
  должен быть коротким, отзываемым и привязанным к подписке/устройству.
- Токены не хранить в `storage.sync` и не синхронизировать через iCloud. Для
  iOS/macOS использовать Keychain с минимальным доступом app group; в JS хранить
  только краткоживущий статус.
- Не отправлять на сервер URL, историю или содержимое страниц. Метрики — только
  агрегированные: регион, результат соединения, задержка и объём трафика.
- При недоступности ноды показывать ошибку и закрывать защищаемый маршрут; не
  менять страну молча и не разрешать прямой выход для режима «Все сайты».
- Проверить IPv4/IPv6, DNS, WebRTC, истечение подписки, отзыв lease, перезапуск
  приложения, сон/пробуждение, смену сети, split-routing и лимит устройств.
- До пилота собрать macOS/iOS targets, пройти `xcodebuild` и установить на
  реальные устройства; затем отдельно проверить App Store entitlement/review.
  Конвертация manifest без прохождения Packet Tunnel тестов не считается
  рабочим VPN.

## Следующий безопасный шаг

Не менять текущие Chrome/Firefox сборки. Сначала подготовить отдельную ветку
`safari-network-extension` с пустым Swift containing app и контрактом IPC,
затем собрать только UI Safari Web Extension и проверить предупреждения packager.
После этого реализовать минимальный Packet Tunnel для одной тестовой ноды,
проверить утечки и учёт устройства, и только потом добавлять все локации,
маршрутизацию РФ и автовыбор. До прохождения этих этапов Safari-архив не
выкладывать и не показывать пользователю как рабочий VPN.
