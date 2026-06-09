' Inicia ROI POS Print Server en segundo plano (ventana minimizada)
' Este archivo es llamado automaticamente por Windows al encender la PC

Dim sh, fs, carpeta
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
carpeta = fs.GetParentFolderName(WScript.ScriptFullName)

' WindowStyle 7 = minimizado sin robar el foco
sh.Run "cmd /c """ & carpeta & "\start.bat""", 7, False
