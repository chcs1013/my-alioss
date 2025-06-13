@cmd /c npm run build
@if %ERRORLEVEL% equ 0 (timeout 3) else (pause)