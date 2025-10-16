# Google OAuth Setup Script for Logi Credit
# This script helps set up the Google OAuth environment

Write-Host "🔧 Logi Credit - Google OAuth Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (Test-Path ".env") {
    Write-Host "⚠️  .env file already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "❌ Setup cancelled." -ForegroundColor Red
        exit 0
    }
}

# Copy .env.example to .env
if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file from template" -ForegroundColor Green
} else {
    Write-Host "❌ .env.example not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📝 Please enter your Google OAuth credentials:" -ForegroundColor Yellow
Write-Host "   (Get them from: https://console.cloud.google.com/apis/credentials)" -ForegroundColor Gray
Write-Host ""

# Prompt for Google Client ID
$clientId = Read-Host "Google Client ID"
if ($clientId) {
    (Get-Content ".env") -replace "GOOGLE_CLIENT_ID=.*", "GOOGLE_CLIENT_ID=$clientId" | Set-Content ".env"
}

# Prompt for Google Client Secret
$clientSecret = Read-Host "Google Client Secret"
if ($clientSecret) {
    (Get-Content ".env") -replace "GOOGLE_CLIENT_SECRET=.*", "GOOGLE_CLIENT_SECRET=$clientSecret" | Set-Content ".env"
}

# Prompt for Redirect URI (with default)
$defaultRedirect = "http://localhost:3000/auth/google/callback"
$redirectUri = Read-Host "Redirect URI (default: $defaultRedirect)"
if (-not $redirectUri) {
    $redirectUri = $defaultRedirect
}
(Get-Content ".env") -replace "GOOGLE_REDIRECT_URI=.*", "GOOGLE_REDIRECT_URI=$redirectUri" | Set-Content ".env"

# Prompt for Port (with default)
$defaultPort = "3000"
$port = Read-Host "Server Port (default: $defaultPort)"
if (-not $port) {
    $port = $defaultPort
}
(Get-Content ".env") -replace "PORT=.*", "PORT=$port" | Set-Content ".env"

Write-Host ""
Write-Host "✅ .env file configured successfully!" -ForegroundColor Green
Write-Host ""

# Install npm dependencies
Write-Host "📦 Installing npm dependencies..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ npm dependencies installed" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install npm dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure you've configured the redirect URI in Google Cloud Console:"
Write-Host "   $redirectUri" -ForegroundColor Gray
Write-Host "2. Start the server with: npm start" -ForegroundColor Gray
Write-Host "3. Open browser to: http://localhost:$port/login.html" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 For more info, see: david/README.google_oauth.md" -ForegroundColor Cyan
