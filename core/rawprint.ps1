# Aliber Print - grava bytes ESC/POS direto no spooler do Windows (datatype RAW),
# sem passar pelo driver gráfico. Uso: rawprint.ps1 -Impressora "Nome" -Arquivo "c:\tmp\x.bin"
param(
  [Parameter(Mandatory = $true)][string]$Impressora,
  [Parameter(Mandatory = $true)][string]$Arquivo
)
$ErrorActionPreference = "Stop"

if (-not ("AliberRaw" -as [type])) {
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AliberRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo {
    public string Nome;
    public string Saida;
    public string Tipo;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string nome, out IntPtr h, IntPtr padrao);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int StartDocPrinter(IntPtr h, int nivel, [In] DocInfo doc);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] dados, int tamanho, out int escritos);

  public static int Enviar(string impressora, byte[] dados) {
    IntPtr h;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero))
      throw new Exception("Impressora '" + impressora + "' nao encontrada no Windows (erro " + Marshal.GetLastWin32Error() + ").");
    try {
      DocInfo doc = new DocInfo();
      doc.Nome = "Aliber Print";
      doc.Tipo = "RAW";
      if (StartDocPrinter(h, 1, doc) == 0)
        throw new Exception("O spooler recusou o trabalho (erro " + Marshal.GetLastWin32Error() + ").");
      try {
        StartPagePrinter(h);
        int escritos;
        if (!WritePrinter(h, dados, dados.Length, out escritos))
          throw new Exception("Falha ao gravar no spooler (erro " + Marshal.GetLastWin32Error() + ").");
        EndPagePrinter(h);
        return escritos;
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
}

$bytes = [System.IO.File]::ReadAllBytes($Arquivo)
$n = [AliberRaw]::Enviar($Impressora, $bytes)
Write-Output "OK $n"
