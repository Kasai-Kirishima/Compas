KOMPAS ONLINE — CDW / DXF BRIDGE
================================

This helper uses the KOMPAS-3D application itself to convert between DXF and
native CDW. The browser application does not write proprietary CDW files.

REQUIREMENTS
- Windows 10/11
- Windows PowerShell 5.1
- Installed KOMPAS-3D with COM automation registered as KOMPAS.Application.7

HOW TO USE
1. In KOMPAS Online, export the drawing as DXF.
2. Run: Запустити_обмін_КОМПАС.bat
3. Select a .dxf source. The helper asks where to save a native .cdw file.
4. KOMPAS-3D opens the DXF and saves it through its own API.

REVERSE DIRECTION
1. Run the same BAT.
2. Select a .cdw source.
3. Choose the destination .dxf file.
4. Import that DXF into KOMPAS Online.

IMPORTANT
- This is a real conversion performed by KOMPAS-3D, not a renamed extension.
- DXF is an interchange format. Parametric dimensions, some symbols, fonts,
  hatch patterns, styles and associations can be converted into plain geometry.
- Always inspect the converted document in KOMPAS-3D, especially dimension
  values, arrowheads, lineweights, text, hatching, title block and print scale.
- No KOMPAS license or product files are included in this package.
- The script has not been executed on this computer because KOMPAS-3D is not
  installed in the build environment. If the COM bridge is unavailable, use
  KOMPAS-3D File > Open / Save As manually.
