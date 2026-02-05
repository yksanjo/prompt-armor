import * as ort from 'onnxruntime-node';

export interface ClassificationResult {
  class: string;
  confidence: number;
  logits: number[];
}

export interface ClassifierConfig {
  modelPath?: string;
  maxSequenceLength?: number;
  classes?: string[];
}

export class Classifier {
  private session?: ort.InferenceSession;
  private tokenizer?: Tokenizer;
  private config: Required<ClassifierConfig>;
  private isLoaded = false;

  constructor(config: ClassifierConfig = {}) {
    this.config = {
      modelPath: './models/prompt-classifier.onnx',
      maxSequenceLength: 512,
      classes: ['benign', 'injection', 'jailbreak', 'exfiltration', 'leak'],
      ...config
    };
  }

  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      // Load ONNX model
      this.session = await ort.InferenceSession.create(this.config.modelPath);
      
      // Initialize tokenizer
      this.tokenizer = new Tokenizer(this.config.maxSequenceLength);
      
      this.isLoaded = true;
    } catch (error) {
      console.warn('Failed to load ML classifier, falling back to heuristics only:', error);
      throw new Error(`Failed to load classifier: ${error}`);
    }
  }

  async predict(text: string): Promise<ClassificationResult> {
    if (!this.isLoaded || !this.session || !this.tokenizer) {
      throw new Error('Classifier not loaded. Call load() first.');
    }

    // Tokenize input
    const inputIds = this.tokenizer.encode(text);
    
    // Prepare tensors
    const inputTensor = new ort.Tensor('int64', BigInt64Array.from(
      inputIds.map(id => BigInt(id))
    ), [1, inputIds.length]);

    const attentionMask = new ort.Tensor('int64', BigInt64Array.from(
      inputIds.map(() => BigInt(1))
    ), [1, inputIds.length]);

    // Run inference
    const feeds = {
      input_ids: inputTensor,
      attention_mask: attentionMask
    };

    const results = await this.session.run(feeds);
    const logits = results.logits.data as Float32Array;

    // Convert to array and apply softmax
    const logitsArray = Array.from(logits);
    const probabilities = this.softmax(logitsArray);

    // Get predicted class
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const confidence = probabilities[maxIndex];

    return {
      class: this.config.classes[maxIndex],
      confidence,
      logits: logitsArray
    };
  }

  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map(e => e / sumExp);
  }

  isReady(): boolean {
    return this.isLoaded;
  }
}

// Simple tokenizer implementation
class Tokenizer {
  private maxLength: number;
  private vocab: Map<string, number>;
  private specialTokens: {
    pad: number;
    unk: number;
    cls: number;
    sep: number;
  };

  constructor(maxLength: number) {
    this.maxLength = maxLength;
    this.vocab = this.buildVocab();
    this.specialTokens = {
      pad: 0,
      unk: 1,
      cls: 2,
      sep: 3
    };
  }

  private buildVocab(): Map<string, number> {
    // In production, load from vocab file
    // For now, use character-level encoding with common tokens
    const vocab = new Map<string, number>();
    let idx = 4; // Start after special tokens

    // Common words and subwords for prompt injection detection
    const commonTokens = [
      'ignore', 'previous', 'instruction', 'system', 'prompt', 'developer',
      'assistant', 'user', 'disregard', 'forget', 'remember', 'new',
      'role', 'act', 'pretend', 'imagine', 'hypothetical', ' fictional',
      'DAN', 'jailbreak', 'mode', 'enabled', 'sudo', 'root', 'admin',
      'password', 'secret', 'key', 'token', 'api', 'key', 'confidential',
      'private', 'internal', 'training', 'data', 'model', 'architecture',
      'base64', 'encode', 'decode', 'eval', 'execute', 'run', 'code',
      'javascript', 'python', 'script', 'function', 'console', 'log',
      'print', 'echo', 'output', 'input', 'format', 'json', 'xml',
      'html', 'tag', 'delimiter', 'separator', 'boundary', 'token',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can',
      'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between',
      'under', 'again', 'further', 'then', 'once', 'here', 'there',
      'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
      'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now'
    ];

    for (const token of commonTokens) {
      vocab.set(token.toLowerCase(), idx++);
    }

    // Add character-level tokens
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/\\\'`~" ';
    for (const char of chars) {
      if (!vocab.has(char)) {
        vocab.set(char, idx++);
      }
    }

    return vocab;
  }

  encode(text: string): number[] {
    const tokens: number[] = [this.specialTokens.cls];
    const lowerText = text.toLowerCase();

    // Simple wordpiece-style tokenization
    let remaining = lowerText;
    
    while (remaining.length > 0 && tokens.length < this.maxLength - 1) {
      let longestMatch = '';
      let matchId = this.specialTokens.unk;

      // Try to find longest matching token
      for (const [token, id] of this.vocab.entries()) {
        if (remaining.startsWith(token) && token.length > longestMatch.length) {
          longestMatch = token;
          matchId = id;
        }
      }

      if (longestMatch) {
        tokens.push(matchId);
        remaining = remaining.slice(longestMatch.length);
      } else {
        // Character-level fallback
        const char = remaining[0];
        tokens.push(this.vocab.get(char) || this.specialTokens.unk);
        remaining = remaining.slice(1);
      }
    }

    // Add SEP token
    tokens.push(this.specialTokens.sep);

    // Pad to max length
    while (tokens.length < this.maxLength) {
      tokens.push(this.specialTokens.pad);
    }

    return tokens.slice(0, this.maxLength);
  }
}

export default Classifier;
