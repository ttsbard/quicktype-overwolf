**[English](../../en/user/developer-mode.md) | Русский**

# Получение Developer Mode в Overwolf

Для загрузки и запуска неопубликованного QuickType через Load unpacked extension аккаунту нужен доступ разработчика (whitelist). Это требование описано в [официальной инструкции Overwolf](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/setting-up-dev-environment/).

1. Перейдите на [портал разработчиков Overwolf](https://dev.overwolf.com/) и следуйте актуальной процедуре регистрации.
2. Заполните заявку достоверными контактами и описанием приложения. Решение и срок рассмотрения определяет Overwolf; фиксированный срок не гарантируется.
3. После предоставления доступа войдите в одобренный аккаунт в клиенте Overwolf и откройте Development Options по официальной инструкции.
4. Нажмите Load unpacked extension и выберите `quicktype-overlay` — папку с `manifest.json`.
5. Запустите QuickType. После изменения исходников выполняйте ручной Reload в Development Options. Параметры автообновления в манифесте предназначены только для разработки; смену манифеста проверяйте после Reload.

Описание заявки можно сформулировать так: QuickType provides a hotkey-activated in-game text field that submits text to a configured REST endpoint, with desktop settings and request diagnostics. Это пример, а не требование к формулировке или языку заявки.

Если загрузка выдаёт Unauthorized App, проверьте вход в аккаунт и наличие developer whitelist. Текущий минимум приложения — Overwolf 0.250.0.
