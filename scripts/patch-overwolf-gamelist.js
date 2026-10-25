/** Patch a local Overwolf GamesList cache. Run explicitly with Overwolf closed. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const parseXmlScript = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$settings = New-Object System.Xml.XmlReaderSettings
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$reader = [System.Xml.XmlReader]::Create((New-Object System.IO.StringReader([Console]::In.ReadToEnd())), $settings)
$doc = New-Object System.Xml.XmlDocument
$doc.PreserveWhitespace = $true
$doc.XmlResolver = $null
try { $doc.Load($reader) } finally { $reader.Dispose() }
`;

function runXmlScript(content, script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', parseXmlScript + script],
    // The full GamesList is several MB; PowerShell JSON also escapes XML tags.
    { input: content, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function validateXml(content) {
  runXmlScript(content, '');
}

function patchGameList(content, gameId) {
  if (!/^\d+$/.test(gameId)) throw new Error('Game ID must contain only digits');
  const result = JSON.parse(runXmlScript(content, `
if ($doc.DocumentElement.NamespaceURI -ne '') { throw 'Unsupported GamesList XML namespace' }
$games = @($doc.SelectNodes('//GameInfo') | Where-Object { $_.SelectSingleNode('ID') -and $_.SelectSingleNode('ID').InnerText.Trim() -eq '${gameId}' })
if ($games.Count -gt 1) { throw 'Duplicate game ID' }
$changed = $false
if ($games.Count -eq 1) {
  $desired = [ordered]@{ ControlModes = 'NotAllowMixedMode'; Client_GameControlMode = 'MixedNotAvailable'; DisableSmartMixMode = 'True' }
  foreach ($tag in $desired.Keys) {
    $nodes = $games[0].SelectNodes($tag)
    if ($nodes.Count -gt 1) { throw ('Duplicate configuration tag: ' + $tag) }
    if ($nodes.Count -eq 0) {
      $node = $doc.CreateElement($tag)
      [void]$games[0].AppendChild($node)
      $changed = $true
    } else { $node = $nodes[0] }
    if ($node.InnerText -ne $desired[$tag]) { $node.InnerText = $desired[$tag]; $changed = $true }
  }
}
@{ found = ($games.Count -eq 1); changed = $changed; content = $doc.OuterXml } | ConvertTo-Json -Compress
`));
  if (!result.changed) result.content = content;
  return result;
}

function main() {
  const gameId = process.argv[2] || '221561';
  if (!/^\d+$/.test(gameId)) throw new Error('Game ID must contain only digits');
  const appData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
  const directory = path.join(appData, 'Overwolf');
  const files = fs.readdirSync(directory).filter(file => /^GamesList\.\d+\.xml$/i.test(file));
  if (!files.length) throw new Error('No GamesList.*.xml files found in ' + directory);
  let found = false;
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    validateXml(content);
    const result = patchGameList(content, gameId);
    found = found || result.found;
    if (!result.found) { console.log('[patch-gamelist] Game not found in ' + file); continue; }
    if (!result.changed) { console.log('[patch-gamelist] Already patched: ' + file); continue; }
    validateXml(result.content);
    if (!fs.existsSync(fullPath + '.bak')) fs.copyFileSync(fullPath, fullPath + '.bak');
    fs.writeFileSync(fullPath, result.content, 'utf8');
    console.log('[patch-gamelist] Patched ' + file + '; original backup: ' + fullPath + '.bak');
  }
  if (!found) throw new Error('Game ID ' + gameId + ' was not found');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('[patch-gamelist] ' + error.message); process.exitCode = 1; }
}
module.exports = { patchGameList, validateXml };
