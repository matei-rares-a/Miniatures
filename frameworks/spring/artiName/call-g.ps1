# Simple helper to call the /g endpoint of the Spring app.
# Usage:
#   pwsh ./call-g.ps1           # default name=World
#   pwsh ./call-g.ps1 Alice     # custom name
#   pwsh ./call-g.ps1 402       # triggers HTTP 402 Payment Required

$name = if ($args.Count -gt 0) { $args[0] } else { "402" }
$url = "http://localhost:1234/g?name=$name"

Write-Host "Requesting $url ..."
try {
    $response = Invoke-WebRequest -Uri $url -Method GET -SkipHttpErrorCheck
    Write-Host "Status : $($response.StatusCode)"
    Write-Host "Body   : $($response.Content)"
} catch {
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

