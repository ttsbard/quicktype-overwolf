**English | [Русский](../../ru/user/connection-json.md)**

# Sharing connection settings

Use the **Connection** tab to export the current connection settings and share the JSON with another user. The file excludes overlay appearance, behavior, and window position.

## Export

Click **Export JSON** to prepare `quicktype-connection.json` from the current form values, including unsaved changes. All headers are exported, including access keys.

Depending on the available APIs, a file save dialog or folder picker opens. If those dialogs are unavailable, Overwolf uses an available Desktop or Documents folder. Cancelling an open dialog does not write a file. The JSON is also copied to the clipboard; if copying fails, the app opens the import field with the prepared JSON so you can copy it manually.

## Import

1. Click **Import JSON**.
2. Choose a UTF-8 `.json` file, drag and drop it onto the file picker, or paste the JSON into the text field.
3. Click **Apply**. If validation fails, the connection settings remain unchanged.
4. Check the service URL and, if needed, click **Send** in **Speech test**.
5. Click **Save** to use the connection in-game.

Example connection for TTSBard ([JSON file for import](../../examples/ttsbard-connection.json)):

```json
{
  "apiUrl": "http://127.0.0.1:10101/v1/speech",
  "httpMethod": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "payloadTemplate": {
    "text": "{text}"
  }
}
```

`apiUrl` is required and must start with `http://` or `https://`. Omitted fields default to POST, the `Content-Type: application/json` header, and the `{"text":"{text}"}` body. Supported methods are GET, POST, and PUT. Unknown fields are rejected, so a typo cannot silently change the connection.

`headers` must be a JSON object with string values. `payloadTemplate` can be an object, array, or string for a custom request body. `{text}` is replaced with the text from the overlay. GET sends no body; you can place `{text}` in the URL. Otherwise, the text is added as the `text` query parameter.

The maximum file or pasted JSON size is 1 MB. Import replaces all four connection fields in the form and leaves other settings unchanged.
