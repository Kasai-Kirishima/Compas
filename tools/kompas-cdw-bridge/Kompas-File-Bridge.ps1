# KOMPAS Online: native CDW <-> DXF bridge.
# Requires Windows, PowerShell 5.1, and an installed KOMPAS-3D with registered COM automation.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-Info([string]$Message, [string]$Title = 'KOMPAS file bridge', [System.Windows.Forms.MessageBoxIcon]$Icon = [System.Windows.Forms.MessageBoxIcon]::Information) {
    [System.Windows.Forms.MessageBox]::Show($Message, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $Icon) | Out-Null
}

$open = New-Object System.Windows.Forms.OpenFileDialog
$open.Title = 'Choose a KOMPAS CDW or DXF file'
$open.Filter = 'KOMPAS drawing / DXF (*.cdw;*.dxf)|*.cdw;*.dxf|KOMPAS drawing (*.cdw)|*.cdw|DXF drawing (*.dxf)|*.dxf|All files (*.*)|*.*'
$open.Multiselect = $false
if ($open.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
$source = $open.FileName
$ext = [System.IO.Path]::GetExtension($source).ToLowerInvariant()
if ($ext -notin @('.cdw', '.dxf')) {
    Show-Info 'Choose a .cdw or .dxf file.' 'Unsupported file' ([System.Windows.Forms.MessageBoxIcon]::Warning)
    exit 1
}
$targetExt = if ($ext -eq '.dxf') { '.cdw' } else { '.dxf' }
$targetDescription = if ($targetExt -eq '.cdw') { 'KOMPAS drawing (*.cdw)|*.cdw' } else { 'DXF drawing (*.dxf)|*.dxf' }
$save = New-Object System.Windows.Forms.SaveFileDialog
$save.Title = if ($targetExt -eq '.cdw') { 'Save as native KOMPAS drawing' } else { 'Export KOMPAS drawing as DXF' }
$save.Filter = $targetDescription
$save.DefaultExt = $targetExt.TrimStart('.')
$save.AddExtension = $true
$save.FileName = [System.IO.Path]::GetFileNameWithoutExtension($source) + $targetExt
if ($save.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
$target = $save.FileName

try {
    $progId = 'KOMPAS.Application.7'
    $comType = [Type]::GetTypeFromProgID($progId)
    if ($null -eq $comType) {
        throw 'KOMPAS.Application.7 was not found. Install KOMPAS-3D and make sure its COM automation is registered.'
    }
    $app = [Activator]::CreateInstance($comType)
    $app.Visible = $true
    $documents = $app.Documents
    $doc = $documents.Open($source, $true, $false)
    if ($null -eq $doc) { throw 'KOMPAS could not open the source document.' }

    # SaveAs is executed by KOMPAS itself; this creates a real native CDW when target extension is .cdw.
    $null = $doc.SaveAs($target)
    Start-Sleep -Milliseconds 700
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "KOMPAS did not create the target file: $target`nTry File > Save As from the opened KOMPAS document."
    }
    $size = (Get-Item -LiteralPath $target).Length
    $direction = if ($targetExt -eq '.cdw') { 'DXF -> native CDW' } else { 'CDW -> DXF' }
    Show-Info ("Conversion complete: {0}`n`nOutput: {1}`nSize: {2} bytes`n`nThe document remains open in KOMPAS-3D. Check dimensions, text, line types, hatching and sheet scale before submission." -f $direction, $target, $size)
}
catch {
    Show-Info ($_.Exception.Message + "`n`nThe source file was not modified by this helper. You can also open it in KOMPAS-3D and use File > Open / Save As manually.") 'KOMPAS conversion failed' ([System.Windows.Forms.MessageBoxIcon]::Error)
    exit 1
}
