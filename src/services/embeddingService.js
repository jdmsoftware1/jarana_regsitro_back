import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmbeddingService {
  constructor() {
    this.openai = null;
    this.vectorStore = [];
    this.documentsPath = path.join(__dirname, '../../knowledge');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY no configurada. Sistema de embeddings deshabilitado.');
      return;
    }

    this.openai = new OpenAI({ apiKey });
    
    try {
      await this.loadDocuments();
      this.initialized = true;
      console.log('✅ Sistema de embeddings inicializado correctamente');
      console.log(`📚 ${this.vectorStore.length} documentos cargados en el vector store`);
    } catch (error) {
      console.error('❌ Error inicializando embeddings:', error.message);
    }
  }

  async loadDocuments() {
    try {
      // Crear carpeta de conocimiento si no existe
      await fs.mkdir(this.documentsPath, { recursive: true });

      // Leer todos los archivos .txt en la carpeta
      const files = await fs.readdir(this.documentsPath);
      const txtFiles = files.filter(f => f.endsWith('.txt'));

      if (txtFiles.length === 0) {
        console.log('📝 No hay documentos en /knowledge. Crea archivos .txt ahí para añadir conocimiento.');
        return;
      }

      console.log(`📖 Cargando ${txtFiles.length} documentos...`);

      for (const file of txtFiles) {
        const filePath = path.join(this.documentsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Dividir en chunks si el documento es muy grande
        const chunks = this.splitIntoChunks(content, 1000);
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await this.createEmbedding(chunk);
          
          this.vectorStore.push({
            id: `${file}_chunk_${i}`,
            source: file,
            content: chunk,
            embedding: embedding,
            metadata: {
              file: file,
              chunkIndex: i,
              totalChunks: chunks.length
            }
          });
        }
        
        console.log(`  ✓ ${file} (${chunks.length} chunks)`);
      }
    } catch (error) {
      console.error('Error cargando documentos:', error);
      throw error;
    }
  }

  splitIntoChunks(text, maxLength = 1000) {
    const paragraphs = text.split('\n\n');
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  async createEmbedding(text) {
    if (!this.openai) {
      throw new Error('OpenAI no está inicializado');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creando embedding:', error);
      throw error;
    }
  }

  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async searchSimilarDocuments(query, topK = 3) {
    if (!this.initialized || this.vectorStore.length === 0) {
      return [];
    }

    try {
      const queryEmbedding = await this.createEmbedding(query);

      const results = this.vectorStore.map(doc => ({
        ...doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
      }));

      results.sort((a, b) => b.similarity - a.similarity);

      return results.slice(0, topK);
    } catch (error) {
      console.error('Error buscando documentos similares:', error);
      return [];
    }
  }

  async reloadDocuments() {
    console.log('🔄 Recargando documentos...');
    this.vectorStore = [];
    await this.loadDocuments();
    console.log('✅ Documentos recargados');
  }

  getStats() {
    return {
      initialized: this.initialized,
      documentsCount: this.vectorStore.length,
      sources: [...new Set(this.vectorStore.map(d => d.source))]
    };
  }
}

// Singleton instance
const embeddingService = new EmbeddingService();

export default embeddingService;
