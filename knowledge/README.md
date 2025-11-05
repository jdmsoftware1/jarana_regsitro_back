# 📚 Knowledge Base - Sistema JARANA

Esta carpeta contiene documentos que la IA usa para responder preguntas.

## 🎯 Cómo Funciona

El sistema de IA:
1. **Lee todos los archivos `.txt`** de esta carpeta
2. **Crea embeddings** (representaciones vectoriales) de cada documento
3. **Busca documentos relevantes** cuando haces una pregunta
4. **Consulta la base de datos** para datos en tiempo real
5. **Combina ambas fuentes** para dar respuestas precisas

## 📝 Cómo Añadir Conocimiento

### 1. Crear un archivo .txt

Crea un nuevo archivo con extensión `.txt` en esta carpeta:

```
knowledge/
  ├── sistema_jarana.txt          (ya existe)
  ├── politicas_empresa.txt       (crea este)
  ├── procedimientos_rrhh.txt     (crea este)
  └── preguntas_frecuentes.txt    (crea este)
```

### 2. Formato Recomendado

Usa formato claro y estructurado:

```txt
# Título Principal

## Sección 1
Contenido de la sección...

### Subsección
Más detalles...

## Sección 2
Otro contenido...
```

### 3. Ejemplos de Documentos

#### politicas_empresa.txt
```txt
# Políticas de la Empresa

## Horario de Trabajo
- Jornada laboral: 8:00 AM - 5:00 PM
- Tolerancia de llegada: 10 minutos
- Pausa para almuerzo: 1 hora (1:00 PM - 2:00 PM)

## Vacaciones
- 22 días laborables al año
- Se solicitan con 15 días de anticipación
- Máximo 10 días consecutivos

## Permisos
- Permiso médico: con justificante
- Permiso personal: máximo 3 días al año
- Permiso por fallecimiento: 3 días
```

#### preguntas_frecuentes.txt
```txt
# Preguntas Frecuentes

## ¿Cómo solicito vacaciones?
1. Accede al sistema JARANA
2. Ve a la sección "Vacaciones"
3. Selecciona las fechas
4. Añade una razón
5. Envía la solicitud
6. Espera aprobación del administrador

## ¿Qué hago si llego tarde?
Si llegas tarde:
- Registra tu entrada normalmente
- El sistema detectará el retraso automáticamente
- Aparecerá en el informe de cumplimiento
- Habla con tu supervisor si es recurrente

## ¿Cómo cambio mi horario?
Solo los administradores pueden cambiar horarios.
Contacta a RRHH para solicitar un cambio.
```

### 4. Recargar el Knowledge Base

Después de añadir o modificar archivos:

**Opción A: Reiniciar el servidor**
```bash
npm run start
```

**Opción B: Usar el endpoint de recarga**
```bash
curl -X POST http://localhost:3000/api/ai/reload-knowledge
```

**Opción C: Desde el frontend**
```javascript
fetch('/api/ai/reload-knowledge', { method: 'POST' })
```

### 5. Verificar el Knowledge Base

Ver estadísticas:
```bash
curl http://localhost:3000/api/ai/knowledge-stats
```

Respuesta:
```json
{
  "initialized": true,
  "documentsCount": 15,
  "sources": [
    "sistema_jarana.txt",
    "politicas_empresa.txt",
    "preguntas_frecuentes.txt"
  ]
}
```

## 💡 Consejos

### ✅ Buenas Prácticas

1. **Usa lenguaje claro y directo**
2. **Estructura el contenido con títulos**
3. **Incluye ejemplos prácticos**
4. **Actualiza regularmente**
5. **Divide documentos grandes** (máx 5000 palabras por archivo)

### ❌ Evita

1. **Información confidencial** (contraseñas, datos personales)
2. **Documentos muy largos** (se dividen automáticamente pero mejor hacerlo manualmente)
3. **Información duplicada** entre archivos
4. **Formatos complejos** (tablas muy grandes, código complejo)

## 🔍 Tipos de Preguntas que Puede Responder

### Con Documentos
- "¿Cuál es la política de vacaciones?"
- "¿Cómo solicito un permiso?"
- "¿Qué es el sistema JARANA?"

### Con Base de Datos
- "¿Quién llegó tarde esta semana?"
- "¿Cuántos empleados hay activos?"
- "¿Qué vacaciones están pendientes?"

### Combinadas
- "¿Cuántos días de vacaciones tengo y cómo los solicito?"
- "¿Qué empleados no cumplen con la política de puntualidad?"

## 🚀 Ejemplo de Uso

```javascript
// Frontend
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "¿Cuál es la política de llegadas tarde?"
  })
});

const data = await response.json();
console.log(data.response);
// "Según la política de la empresa, hay una tolerancia de 10 minutos..."
```

## 📊 Arquitectura

```
Usuario pregunta
    ↓
Embedding del mensaje
    ↓
Búsqueda en vector store ← Documentos .txt
    ↓
Consulta a base de datos ← Datos en tiempo real
    ↓
GPT combina ambas fuentes
    ↓
Respuesta al usuario
```

## 🔧 Mantenimiento

### Actualizar Documentos
1. Edita el archivo .txt
2. Guarda los cambios
3. Recarga el knowledge base

### Añadir Nuevos Documentos
1. Crea archivo .txt en esta carpeta
2. Añade contenido
3. Recarga el knowledge base

### Eliminar Documentos
1. Elimina el archivo .txt
2. Recarga el knowledge base

## 📝 Plantilla de Documento

```txt
# [Título del Documento]

## Descripción
Breve descripción del contenido...

## Sección 1
Contenido detallado...

### Ejemplo
Ejemplo práctico...

## Sección 2
Más contenido...

## Referencias
- Link 1
- Link 2

---
Última actualización: [Fecha]
```

## 🎓 Recursos

- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- RAG (Retrieval Augmented Generation): Técnica que combina búsqueda + generación
- Vector Store: Base de datos de embeddings para búsqueda semántica

---

**¡Añade tus documentos y el sistema estará listo para responder preguntas!** 🚀
