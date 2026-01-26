Param(
    [string]$BaseUrl = "http://localhost:8000"
)

$paths = @(
    "/home/",
    "/home/index.html",
    "/people/kristof.html",
    "/data/transactions.js"
)

Write-Host "Running smoke checks against $BaseUrl" -ForegroundColor Cyan

foreach ($p in $paths) {
    $url = $BaseUrl.TrimEnd('/') + $p
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        if ($resp.StatusCode -eq 200) {
            Write-Host "$p -> 200 OK" -ForegroundColor Green
        } else {
            Write-Host "$p -> FAILED: status $($resp.StatusCode)" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "$p -> ERROR: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "All smoke tests passed." -ForegroundColor Green
exit 0
