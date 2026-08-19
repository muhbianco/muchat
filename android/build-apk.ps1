#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$javaHome = "D:\java"
$androidHome = "D:\Android\sdk"
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:Path = "$javaHome\bin;$androidHome\platform-tools;$env:Path"

$iconSrc = Join-Path (Split-Path $root -Parent) "desktop\icon.png"
$mipmap = Join-Path $root "app\src\main\res\mipmap-xxxhdpi"
New-Item -ItemType Directory -Force -Path $mipmap | Out-Null
Copy-Item -Force $iconSrc (Join-Path $mipmap "ic_launcher.png")
Copy-Item -Force $iconSrc (Join-Path $mipmap "ic_launcher_round.png")

$wrapperJar = Join-Path $root "gradle\wrapper\gradle-wrapper.jar"
if (-not (Test-Path $wrapperJar)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $wrapperJar) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/gradle/gradle/raw/v8.11.1/gradle/wrapper/gradle-wrapper.jar" -OutFile $wrapperJar
}

$keystore = Join-Path $root "release.jks"
$props = Join-Path $root "keystore.properties"
if (-not (Test-Path $keystore)) {
    $bytes = New-Object byte[] 16
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pass = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    & "$javaHome\bin\keytool.exe" -genkeypair -keystore $keystore -alias muchat `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $pass -keypass $pass `
        -dname "CN=Muchat, O=MuhBianco, C=BR" | Out-Null
    @"
storeFile=release.jks
storePassword=$pass
keyAlias=muchat
keyPassword=$pass
"@ | Set-Content -Path $props -Encoding ASCII
}

Push-Location $root
try {
    & .\gradlew.bat assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "gradle assembleRelease failed" }
} finally {
    Pop-Location
}

$gradleFile = Join-Path $root "app\build.gradle"
$versionMatch = Select-String -Path $gradleFile -Pattern 'versionName "([^"]+)"' | Select-Object -First 1
$version = if ($versionMatch) { $versionMatch.Matches[0].Groups[1].Value } else { "1.0.7" }

$apk = Join-Path $root "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { throw "APK nao gerado: $apk" }

$download = Join-Path (Split-Path $root -Parent) "brand\public\download"
New-Item -ItemType Directory -Force -Path $download | Out-Null
Copy-Item -Force $apk (Join-Path $download "Muchat-$version.apk")
Copy-Item -Force $apk (Join-Path $download "Muchat.apk")
Get-Item (Join-Path $download "Muchat-$version.apk") | Select-Object FullName, Length
