$oldStr = "const API = 'http://127.0.0.1:8000'"
$newStr = "const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'"

$files = Get-ChildItem -Path 'P:\CloudSecurityPanel\app\ui\src' -Recurse -Include '*.jsx','*.js'
$count = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -match [regex]::Escape($oldStr)) {
        $newContent = $content.Replace($oldStr, $newStr)
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        Write-Host "Fixed: $($file.Name)"
        $count++
    }
}
Write-Host "Total files fixed: $count"
