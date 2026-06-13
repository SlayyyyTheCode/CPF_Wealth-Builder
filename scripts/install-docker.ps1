# Installs WSL2 + Docker Desktop system-wide (adds `docker` to the system PATH,
# so it works from any folder). Run elevated. A REBOOT is required afterwards.
$ErrorActionPreference = "Continue"
Write-Host "=== 1/3  Enabling WSL2 (Virtual Machine Platform + WSL) ===" -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --install --no-distribution

Write-Host "=== 2/3  Installing Docker Desktop via Chocolatey ===" -ForegroundColor Cyan
choco install docker-desktop -y

Write-Host "=== 3/3  Done ===" -ForegroundColor Green
Write-Host "REBOOT now. After reboot: launch Docker Desktop once, wait for 'Engine running'," -ForegroundColor Yellow
Write-Host "then run:  docker compose up -d   (from the CPF_Builder folder)" -ForegroundColor Yellow
Write-Host ""
Write-Host "If Docker says virtualization is disabled, enable Intel VT-x / AMD-V (SVM)" -ForegroundColor Yellow
Write-Host "in your BIOS/UEFI, then reboot again." -ForegroundColor Yellow
Read-Host "Press Enter to close this window"
