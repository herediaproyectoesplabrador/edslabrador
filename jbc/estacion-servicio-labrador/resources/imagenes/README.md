# Imagenes publicadas

Use las carpetas fijas `panoramicas/` y `drone/` para publicar imagenes con el sitio.

Como Netlify publica el sitio como archivos estaticos, el navegador no puede listar el contenido de una carpeta directamente. Por eso la galeria lee `manifest.json`.

Despues de agregar o quitar imagenes, ejecute:

```powershell
node jbc/estacion-servicio-labrador/resources/imagenes/generate-manifest.js
```

El script recorre las carpetas fijas y actualiza `manifest.json` automaticamente. Cada nombre de archivo se usa como numero de busqueda.

Ejemplo:

```json
{
	"groups": {
		"panoramicas": [
			{
				"number": "PANO-001",
				"title": "Panoramica 001",
				"file": "panoramicas/PANO-001.jpg"
			}
		],
		"drone": [
			{
				"number": "DR-001",
				"title": "Vuelo drone 001",
				"file": "drone/DR-001.jpg"
			}
		]
	}
}
```
