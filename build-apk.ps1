$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "C:\Users\Matt\AndroidSdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
$sdkmanager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Output "Installing platform-tools, platform 34, build-tools 34.0.0 ..."
& $sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Output "Building debug APK..."
Set-Location "C:\Users\Matt\Desktop\Code\PhotoScout\mobile-app\android"
& .\gradlew.bat assembleDebug

Write-Output "BUILD SCRIPT DONE"
