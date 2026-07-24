# Desktop App Assets

Place the following icon files here for electron-builder:

| File | Required For | Dimensions | Format |
|---|---|---|---|
| `icon.ico` | Windows installer + taskbar | 256×256 | ICO (multi-size) |
| `icon.png` | Window title bar (runtime) | 512×512 | PNG |
| `icon.icns` | macOS (future) | 512×512 | ICNS |

## Generating Icons

Using ImageMagick:
```bash
# PNG → ICO (Windows)
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

Or use online tools like https://convertio.co/png-ico/

## Notes
- electron-builder will fail if `icon.ico` or `icon.png` does not exist
- Use a 512×512 PNG as the source for best quality
- The icon should reflect the POS/retail brand (e.g., a shoe or cash register symbol)
