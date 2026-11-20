$ErrorActionPreference = 'Stop'
$work = Join-Path $env:RUNNER_TEMP 'companion-signing'
$info = Get-Content -Raw -LiteralPath (Join-Path $work 'build-info.json') | ConvertFrom-Json
$inputDir = Join-Path $work 'input'
$algorithm = 'SHA256'
$programs = @($info.programs)
$out = Join-Path $work 'out'
$signTool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } | Select-Object -Last 1
if (-not $signTool) { throw 'The Windows SDK SignTool was not found.' }

function Get-Machine([string]$File) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($File))
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'Expected an MZ executable.' }
        $reader.BaseStream.Position = 0x3c
        $reader.BaseStream.Position = $reader.ReadUInt32()
        if ($reader.ReadUInt32() -ne 0x4550) { throw 'Expected a PE executable.' }
        return $reader.ReadUInt16()
    } finally { $reader.Dispose() }
}

function Verify-Signature([string]$File) {
    & $signTool.FullName verify /pa /all $File | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'SignTool could not verify the executable.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $File
    if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate -or
        $signature.SignerCertificate.GetNameInfo('SimpleName', $false) -ne '6529 Collection LLC') {
        throw 'Expected a valid, timestamped 6529 Collection LLC signature.'
    }
    return $signature.SignerCertificate.Thumbprint
}

foreach ($entry in $programs) {
    $file = Join-Path $inputDir $entry.path
    $machine = if ($entry.path -eq 'windows/nsis/uninstall.exe') { 0x14c } else { 0x8664 }
    if ((Get-Machine $file) -ne $machine) { throw "Unexpected architecture for $($entry.path)." }
}

$toSign = $programs
$publishers = @()
if ($env:PHASE -eq 'installer') {
    $installer = Join-Path $inputDir $info.installer.path
    if ((Get-Machine $installer) -ne 0x14c) { throw 'Expected an NSIS setup stub.' }
    foreach ($entry in $programs) {
        $publishers += Verify-Signature (Join-Path $inputDir $entry.path)
    }
    $sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
    if (-not $sevenZip) { $sevenZip = Join-Path $env:ProgramFiles '7-Zip/7z.exe' }
    $inspect = Join-Path $work 'installer-contents'
    & $sevenZip x $installer "-o$inspect" -y -bso0 -bsp0 'companion-windows.exe' 'helpers/companion-host.exe' 'helpers/companion-iroh-transport.exe' 'uninstall.exe'
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the NSIS installer.' }
    foreach ($entry in $programs) {
        $relative = if ($entry.path -eq 'windows/nsis/uninstall.exe') {
            'uninstall.exe'
        } else {
            $entry.path.Substring('windows/'.Length)
        }
        $installed = @(Get-ChildItem -LiteralPath $inspect -File -Recurse |
            Where-Object { $_.FullName.Replace('\', '/').EndsWith("/$relative") })
        if ($installed.Count -ne 1 -or
            (Get-FileHash -LiteralPath $installed[0].FullName -Algorithm $algorithm).Hash -ne $entry.sha256) {
            throw "The NSIS setup does not contain the signed $relative."
        }
    }
    $toSign = @($info.installer)
}

$azureSignTool = Join-Path $env:USERPROFILE '.dotnet/tools/AzureSignTool.exe'
if (-not (Test-Path -LiteralPath $azureSignTool)) { throw 'AzureSignTool was not installed.' }
$sign = @('sign',
    '--azure-key-vault-url', $env:AZURE_KEY_VAULT_URL,
    '--azure-key-vault-client-id', $env:AZURE_CLIENT_ID,
    '--azure-key-vault-client-secret', $env:AZURE_CLIENT_SECRET,
    '--azure-key-vault-tenant-id', $env:AZURE_TENANT_ID,
    '--azure-key-vault-certificate', $env:CERT_NAME,
    '--file-digest', 'sha256',
    '--timestamp-rfc3161', 'http://timestamp.digicert.com', '--timestamp-digest', 'sha256')
foreach ($entry in $toSign) {
    $file = Join-Path $out $entry.path
    New-Item -ItemType Directory -Force (Split-Path -Parent $file) | Out-Null
    Copy-Item -LiteralPath (Join-Path $inputDir $entry.path) -Destination $file
    & $azureSignTool @sign $file
    if ($LASTEXITCODE -ne 0) { throw "AzureSignTool failed for $($entry.path)." }
    $publishers += Verify-Signature $file
}
if (($publishers | Sort-Object -Unique).Count -ne 1) {
    throw 'The release programs and installer were signed with different certificates.'
}
