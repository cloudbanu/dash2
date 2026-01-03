$content = Get-Content 'app.js' -Raw
$content = $content -replace '(?<!Client)\.from\(', 'Client.from('
$content = $content -replace '(?<!Client)\.storage\b', 'Client.storage'
$content = $content -replace '(?<!Client)\.channel\(', 'Client.channel('
$content = $content -replace 'await supabase(?!Client)', 'await supabaseClient'
Set-Content 'app.js' -Value $content -NoNewline
