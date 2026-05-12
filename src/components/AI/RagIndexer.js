import { ragSearch } from '@/utils/rag/search-utility';
import { useEffect } from 'react';

export function useRagIndexer() {
  useEffect(() => {
    const initRag = async () => {
      try {
        // Use a race to avoid hanging the app if initialization is stuck
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RAG Init Timeout')), 10000),
        );
        await Promise.race([ragSearch.init(), timeout]);
        console.log('[RAG] Indexer initialized successfully.');
      } catch (error) {
        console.error('[RAG] Failed to initialize indexer:', error);
      }
    };

    initRag();
  }, []);
}
