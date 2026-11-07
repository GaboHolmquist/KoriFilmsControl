#!/usr/bin/env python3
"""
Generador Local de Cartas Digitales — Kori Films Control
Copia la plantilla limpia (2 categorías, 2 productos c/u) a una nueva carpeta de proyecto en el Mac.
100% local: no genera dominios, ni sube nada a GitHub, ni afecta la red.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'plantilla-carta')
DOCUMENTS_DIR = os.path.dirname(BASE_DIR)


def slugify(text):
    text = text.strip()
    slug = re.sub(r'[^\w\s-]', '', text).strip().lower()
    return re.sub(r'[-\s]+', '-', slug)


def sanitize_folder_name(text):
    # Genera nombre limpio para la carpeta en Documents, ej: "KomorebiCafe" o "Cafe-Aurora"
    words = re.findall(r'[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+', text)
    cleaned = ''.join(w.capitalize() for w in words)
    return cleaned if cleaned else 'NuevaCartaDigital'


def generar_prompt_antigravity(nombre, tipo, ciudad, ruta_destino):
    return f"""Hola. Estamos iniciando el proyecto de la Carta Digital Interactiva para **{nombre}** ({tipo} en {ciudad}).

Este proyecto fue generado a partir de la plantilla estandarizada de alta conversión de **Kori Films** (con la misma ingeniería y arquitectura de la carta de Tencha Matchería).

📍 **Ubicación del Workspace:** `{ruta_destino}`

### 📐 Arquitectura del Proyecto
1. **Fuente de la verdad:** Toda la carta se controla desde `data/menu.json` (categorías, productos, precios, disponibilidad y recomendados).
2. **Estructura limpia inicial:** El proyecto arranca en modo local con 2 categorías y 2 productos por categoría en blanco como base para ingestar la información.
3. **Formatos multimedia recomendados:**
   - Fotos: Proporción 4:5 vertical (720x900px), optimizadas en formato WebP en `productos/<categoria>/<producto>/foto.webp`.
   - Videos en bucle: Video vertical sin audio (H.264 / 720p) en `productos/<categoria>/<producto>/animacion.mp4`.
4. **Motor interactivo (`js/main.js`):**
   - Carrusel automático de recomendados con dots sincronizados.
   - Autoplay por franja de scroll (Viewport Band Focus: reproduce sutilmente el video al entrar en pantalla).
   - Barra sticky de navegación rápida entre categorías.
   - Popups modales táctiles para ver detalles, ingredientes y variantes.
   - Paleta de diseño basada en variables en `css/style.css`.
5. **Respaldo:** Cuenta con `checkpoint/checkpoint.py` para respaldar localmente en cualquier momento.

### 🎯 Nuestro Objetivo en este Chat:
1. Guiarme en definir los nombres reales de las categorías y productos de **{nombre}**.
2. Adaptar la paleta de colores y el estilo visual según la identidad de la marca.
3. Subir e ingestar las fotos y videos reales en sus respectivas carpetas.
4. Mantener la carta funcionando en modo local hasta que definamos el nombre del repositorio y la autorización para desplegarla en GitHub Pages / Producción.

Comencemos revisando qué categorías y productos vamos a cargar primero."""


def main():
    parser = argparse.ArgumentParser(description="Generador local de cartas digitales")
    parser.add_argument("--nombre", required=True, help="Nombre del restaurante / cafetería")
    parser.add_argument("--tipo", default="Cafetería & Restaurante", help="Tipo de local gastronómico")
    parser.add_argument("--ciudad", default="Santiago, Chile", help="Ciudad o comuna")
    parser.add_argument("--email", default="", help="Correo de contacto")
    parser.add_argument("--destino", default="", help="Ruta personalizada de la carpeta de destino")

    args = parser.parse_args()

    nombre = args.nombre.strip()
    slug = slugify(nombre)
    folder_name = sanitize_folder_name(nombre)

    if args.destino:
        dest_dir = os.path.abspath(args.destino)
    else:
        dest_dir = os.path.join(DOCUMENTS_DIR, folder_name)

    print(f"\n=======================================================")
    print(f"🚀 GENERADOR LOCAL DE CARTA DIGITAL — KORI FILMS")
    print(f"=======================================================")
    print(f"• Restaurante: {nombre}")
    print(f"• Carpeta destino: {dest_dir}")
    print(f"• Modo: 100% LOCAL (sin despliegues en red)")
    print(f"-------------------------------------------------------")

    if os.path.exists(dest_dir):
        print(f"⚠️  La carpeta ya existe: {dest_dir}")
        print(f"   Por seguridad, no se sobreescribirá un proyecto existente.")
        print(f"   Elige otro nombre o remueve la carpeta antes de continuar.")
        sys.exit(1)

    if not os.path.exists(TEMPLATE_DIR):
        print(f"❌ Error: No se encontró la plantilla en {TEMPLATE_DIR}")
        sys.exit(1)

    # 1. Copiar plantilla al destino
    shutil.copytree(TEMPLATE_DIR, dest_dir)

    # 2. Reemplazar variables en index.html
    index_path = os.path.join(dest_dir, 'index.html')
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = content.replace('{{NOMBRE_RESTAURANTE}}', nombre)
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(content)

    # 3. Inicializar git local en el nuevo proyecto
    try:
        subprocess.run(['git', 'init'], cwd=dest_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['git', 'add', '-A'], cwd=dest_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['git', 'commit', '-m', f"feat: carta digital inicial para {nombre}"], cwd=dest_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    # 4. Generar archivo CONTEXTO_ANTIGRAVITY.md
    contexto_texto = generar_prompt_antigravity(nombre, args.tipo, args.ciudad, dest_dir)
    context_path = os.path.join(dest_dir, 'CONTEXTO_ANTIGRAVITY.md')
    with open(context_path, 'w', encoding='utf-8') as f:
        f.write(f"# Contexto del Proyecto: {nombre}\n\n")
        f.write(contexto_texto)
        f.write("\n")

    print(f"✓ Plantilla copiada exitosamente.")
    print(f"✓ 2 categorías y 2 productos en blanco preparados.")
    print(f"✓ Repositorio local Git inicializado.")
    print(f"✓ Archivo de contexto generado en: {context_path}")
    print(f"\n📋 MENSAJE DE CONTEXTO PARA COPIAR A ANTIGRAVITY:\n")
    print(contexto_texto)
    print(f"\n=======================================================\n")


if __name__ == '__main__':
    main()
