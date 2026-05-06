import { CreateMLCEngine } from '@mlc-ai/web-llm';

// A single variable to hold the initialization promise
let enginePromise = null;

/**
 * Initializes the WebLLM engine exactly once.
 * Subsequent calls will return the already-running engine promise.
 */
const getEngine = () => {
  if (!enginePromise) {
    // Assign an async IIFE to the promise variable to satisfy Biome's
    // no-async-promise-executor rule while maintaining the singleton pattern.
    enginePromise = (async () => {
      try {
        const selectedModel = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';

        console.info('Initializing WebLLM...');

        const engine = await CreateMLCEngine(
          selectedModel,
          {
            initProgressCallback: (progress) => {
              console.info(`[WebLLM]: ${progress.text}`);
            },
          },
          {
            context_window_size: 4096,
          },
        );

        return engine;
      } catch (error) {
        console.error('Failed to initialize WebLLM engine:', error);
        // Reset on failure so the user can try again without reloading
        enginePromise = null;
        throw error;
      }
    })();
  }

  return enginePromise;
};

/**
 * Sends a prompt to the local WebLLM model and returns the text response.
 * @param {string} prompt - The user's input or full codebase context.
 * @returns {Promise<string>} - The AI's generated response.
 */
export const askWebLLM = async (prompt) => {
  try {
    const engine = await getEngine();

    const messages = [
      {
        role: 'system',
        content:
          'You are an expert React and JavaScript developer assistant. If you need to modify or create files, use EXACTLY this format (NO markdown codeblocks like ```): \n// --- File: path/to/file.js ---\n[code content]\n// --- End File ---\nProvide concise, accurate code and explanations.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const reply = await engine.chat.completions.create({
      messages,
      temperature: 0.7,
    });

    return reply.choices?.[0]?.message?.content ?? 'No response generated.';
  } catch (error) {
    console.error('Error in askWebLLM:', error);
    throw new Error(`Local AI failed: ${error.message || error}`);
  }
};

/**
 * Halts the current generation process of the WebLLM engine.
 */
export const interruptWebLLM = async () => {
  if (enginePromise) {
    try {
      const engine = await enginePromise;
      await engine.interruptGenerate();
      engine.interruptSignal = false; // Reset the signal so future prompts can run
    } catch (e) {
      console.warn('Failed to interrupt WebLLM:', e);
    }
  }
};
