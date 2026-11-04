' Starts the program without a window. The log is written to companion.log
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root & "\companion"
sh.Run "cmd /c node index.js > ""..\companion.log"" 2>&1", 0, False
