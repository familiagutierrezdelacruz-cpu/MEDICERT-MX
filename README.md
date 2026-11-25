# MediCert MX

Generador de certificados médicos (IMSS-Bienestar) con servidor propio.

- Node.js + Express + SQLite (`data/medicert.db`, fuera de GitHub)
- Usuarios con contraseña (administrador / capturista)
- Padrón de pacientes ligado al CURP, edad y sexo calculados del CURP
- Folio consecutivo que nunca se repite; los folios se cancelan, no se borran
- Historial completo con buscador, reporte por fechas/médico, exportación a Excel (CSV)

## Instalación en el VPS

```bash
cd /var/www/medicert
npm install --omit=dev
node scripts/crear-admin.js          # crea tu usuario administrador
node scripts/migrar-firebase.js      # (una vez) trae los datos de la versión anterior
```

Servicio (`/etc/systemd/system/medicert.service`) en el puerto 3047 y Nginx como proxy hacia `127.0.0.1:3047`.

## Actualizar

```bash
cd /var/www/medicert && git pull && npm install --omit=dev && systemctl restart medicert
```

## Respaldos

`scripts/respaldo.sh` copia la base a `/var/backups/medicert` (últimos 30 días). Se programa en cron diario.
