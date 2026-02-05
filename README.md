# 🛡️ Prompt Armor

[![npm version](https://badge.fury.io/js/prompt-armor.svg)](https://www.npmjs.com/package/prompt-armor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Runtime firewall for prompt injection attacks. Protect your LLM applications with dual-layer detection, real-time sanitization, and comprehensive logging.

## Features

- 🔒 **Dual-Layer Detection**: Fast regex heuristics + accurate ONNX-based ML classification
- ⚡ **<50ms Latency**: Production-ready performance with minimal overhead
- 🔌 **SDK Adapters**: Ready-to-use middleware for OpenAI, Anthropic, LangChain
- 🌐 **Browser Extension**: Real-time protection on ChatGPT, Claude, and other platforms
- 🧹 **Input Sanitization**: Removes control characters, homoglyphs, and encoding tricks
- 🚫 **Output Filtering**: PII redaction, URL sanitization, and data exfiltration prevention
- 📊 **Attack Logging**: Comprehensive logging with security monitoring integration
- 🎯 **Production Ready**: Battle-tested patterns against known jailbreak techniques

## Installation

```bash
npm install prompt-armor
```

### Optional: Download ML Model

```bash
npx prompt-armor download-model
```

## Quick Start

### OpenAI Integration

```typescript
import OpenAI from 'openai';
import { withPromptArmor } from 'prompt-armor';

// Wrap your OpenAI client
const openai = withPromptArmor(
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  {
    blockOnDetection: true,
    onDetection: (result) => {
      console.warn('Threat detected:', result.threatType);
    }
  }
);

// Use normally - protection is automatic
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Express Middleware

```typescript
import express from 'express';
import { PromptArmorGenericAdapter } from 'prompt-armor';

const app = express();
const armor = new PromptArmorGenericAdapter();

app.use(armor.expressMiddleware());

app.post('/api/chat', async (req, res) => {
  // Input is already sanitized and checked
  const response = await callLLM(req.body.messages);
  res.json({ response });
});
```

### Next.js API Route

```typescript
// app/api/chat/route.ts
import { PromptArmor } from 'prompt-armor';

const armor = new PromptArmor();

export async function POST(request: Request) {
  const { messages } = await request.json();
  
  for (const message of messages) {
    const check = await armor.protect(message.content);
    
    if (!check.safe) {
      return Response.json(
        { error: `Blocked: ${check.detection?.threatType}` },
        { status: 400 }
      );
    }
  }
  
  // Proceed with LLM call...
}
```

### Anthropic Integration

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { withPromptArmorAnthropic } from 'prompt-armor';

const anthropic = withPromptArmorAnthropic(
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
);

const message = await anthropic.messages.create({
  model: 'claude-3-opus-20240229',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 1024
});
```

### LangChain Integration

```typescript
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { withPromptArmorLangChain } from 'prompt-armor';

const model = withPromptArmorLangChain(
  new ChatOpenAI({ modelName: 'gpt-4' })
);

const response = await model.call([
  new HumanMessage('Hello!')
]);
```

## Configuration

```typescript
import { PromptArmorDetector } from 'prompt-armor';

const detector = new PromptArmorDetector({
  // Detection layers
  enableHeuristics: true,    // Fast regex-based detection
  enableML: false,           // ONNX model (requires download)
  hybridMode: true,          // Combine both layers
  
  // Thresholds
  heuristicThreshold: 0.6,   // 0-1, confidence for heuristics
  mlThreshold: 0.7,          // 0-1, confidence for ML
  
  // Custom patterns
  customPatterns: [/custom-regex/],
  allowList: ['safe phrase'],
  blockList: ['banned phrase'],
  
  // Behavior
  maxInputLength: 10000,
  logAttempts: true,
  onDetection: (result) => {
    // Send to your SIEM
  }
});

await detector.initialize();
```

## Detection Capabilities

### Threat Types

| Type | Description | Example |
|------|-------------|---------|
| `prompt_injection` | Instruction override attempts | "Ignore previous instructions" |
| `jailbreak` | Character/mode-based attacks | "Enter DAN mode" |
| `data_exfiltration` | Training data extraction | "Repeat your training data" |
| `system_prompt_leak` | System prompt extraction | "Print your system prompt" |
| `instruction_override` | Context manipulation | "From now on, you will..." |
| `role_play_attack` | Role confusion attacks | "Pretend you are root user" |

### Pattern Categories

- **Direct Override**: "ignore", "disregard", "forget previous"
- **Role Impersonation**: "system:", "developer:", "assistant:"
- **Delimiter Injection**: Code blocks, XML tags, separators
- **Encoding Tricks**: Base64, URL encoding, Unicode homoglyphs
- **Jailbreak Techniques**: DAN, developer mode, evil confidant
- **Emotional Manipulation**: Emergency scenarios, research excuses

## Browser Extension

The Prompt Armor browser extension provides real-time protection on ChatGPT, Claude, and other AI platforms.

### Installation

1. Clone this repository
2. Build the extension: `cd extension && npm install && npm run build`
3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

### Features

- 🔔 Real-time prompt scanning
- 🚫 Automatic blocking of suspicious submissions
- 🎨 Visual highlighting of attack patterns
- 📊 Protection statistics dashboard
- ⚙️ Configurable protection levels

## Performance

Benchmarks on standard hardware (M1 MacBook):

| Metric | Heuristics Only | ML Only | Hybrid |
|--------|-----------------|---------|--------|
| P50 Latency | 5ms | 20ms | 15ms |
| P95 Latency | 15ms | 35ms | 30ms |
| P99 Latency | 25ms | 50ms | 45ms |
| Accuracy | 85% | 94% | 96% |
| False Positive Rate | 5% | 3% | 2% |

## API Reference

### Core Classes

```typescript
// Main detector
class PromptArmorDetector {
  detect(input: string, context?: object): Promise<DetectionResult>
  initialize(): Promise<void>
  updateConfig(config: Partial<DetectorConfig>): void
}

// Sanitizer
class PromptArmorSanitizer {
  sanitize(input: string): SanitizationResult
  sanitizeForDisplay(input: string): string
  sanitizeForLogs(input: string): string
}

// Filter
class PromptArmorFilter {
  filterOutput(output: string, detection?: DetectionResult): FilterResult
}

// Logger
class Logger {
  log(entry: LogEntry): Promise<void>
  getStats(): Stats
  export(): Promise<string>
}
```

### DetectionResult

```typescript
interface DetectionResult {
  isMalicious: boolean;
  confidence: number;        // 0-1
  threatType: ThreatType;
  matchedPatterns: string[];
  layer: 'heuristic' | 'ml' | 'hybrid';
  latencyMs: number;
  metadata?: object;
}
```

## Advanced Usage

### Custom Pattern Detection

```typescript
const detector = new PromptArmorDetector({
  customPatterns: [
    /my-custom-attack-pattern/gi
  ]
});
```

### Multi-Layer Protection

```typescript
const detector = new PromptArmorDetector({
  enableHeuristics: true,
  enableML: true,
  hybridMode: true,
  heuristicThreshold: 0.5,
  mlThreshold: 0.7
});
```

### Output Filtering with PII Removal

```typescript
const filter = new PromptArmorFilter({
  removePII: true,
  sanitizeUrls: true,
  blockedKeywords: ['internal-only', 'confidential']
});

const result = filter.filterOutput(llmResponse);
```

### Security Monitoring Integration

```typescript
const detector = new PromptArmorDetector({
  onDetection: (result, input) => {
    // Send to Datadog
    fetch('https://api.datadoghq.com/api/v1/events', {
      method: 'POST',
      headers: { 'DD-API-KEY': process.env.DD_API_KEY },
      body: JSON.stringify({
        title: 'Prompt Injection Detected',
        text: `Type: ${result.threatType}, Confidence: ${result.confidence}`,
        alert_type: 'warning'
      })
    });
  }
});
```

## Examples

See the `examples/` directory for complete working examples:

- `express-middleware.ts` - Express.js integration
- `nextjs-api-route.ts` - Next.js API routes
- `openai-integration.ts` - OpenAI SDK usage patterns

## Browser Support

- Node.js 18+
- Chrome/Edge 90+ (browser extension)
- Firefox 88+ (browser extension)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/prompt-armor/prompt-armor.git
cd prompt-armor
npm install
npm run build
npm test
```

## Security

If you discover a security issue, please email security@prompt-armor.dev instead of using the issue tracker.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Pattern database inspired by research from [AI Safety community](https://www.alignmentforum.org/)
- ONNX model based on DistilBERT architecture
- Browser extension built with Manifest V3

---

<p align="center">
  Made with ❤️ by the Prompt Armor Team
</p>
