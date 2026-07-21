@echo off
cd /d "%~dp0"
echo.
echo  === Diagnostico Volten Gym ===
echo  Escuchando en el puerto 4499 - deja esta ventana abierta
echo  y pasa la cara en el aparato para ver que llega aqui.
echo.
node diagnostico.js
pause
