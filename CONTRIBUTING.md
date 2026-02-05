# Contributing to Prompt Armor

Thank you for your interest in contributing to Prompt Armor! We welcome contributions from the community.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/prompt-armor/prompt-armor.git
cd prompt-armor

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Project Structure

```
prompt-armor/
├── src/
│   ├── core/           # Core detection, sanitization, filtering
│   ├── adapters/       # SDK integrations (OpenAI, Anthropic, etc.)
│   ├── browser/        # Browser-specific code
│   └── patterns/       # Attack pattern definitions
├── extension/          # Browser extension
├── models/             # ONNX model files
├── examples/           # Usage examples
├── tests/              # Test suite
└── scripts/            # Build and utility scripts
```

## Adding New Attack Patterns

To add new injection or jailbreak patterns:

1. Edit `src/patterns/injection-patterns.ts` or `src/patterns/jailbreak-patterns.ts`
2. Add a new pattern definition:

```typescript
{
  name: 'my_new_pattern',
  pattern: /regex-pattern-here/gi,
  severity: 'high', // 'low' | 'medium' | 'high' | 'critical'
  description: 'Description of the attack pattern'
}
```

3. Add corresponding tests in `tests/detector.test.ts`
4. Run tests to verify: `npm test`

## Adding New Adapters

To add support for a new LLM SDK:

1. Create a new file in `src/adapters/`:

```typescript
// src/adapters/my-llm.ts
import { PromptArmorDetector } from '../core/detector';

export class MyLLMAdapter {
  private detector: PromptArmorDetector;

  constructor(config?: MyAdapterConfig) {
    this.detector = new PromptArmorDetector(config);
  }

  wrapClient(client: MyLLMClient): MyLLMClient {
    // Implement wrapping logic
  }
}
```

2. Export from `src/index.ts`
3. Add tests in `tests/adapters.test.ts`
4. Add an example in `examples/`

## Testing

All contributions should include tests. We use Jest for testing.

```bash
# Run all tests
npm test

# Run specific test file
npm test -- detector.test.ts

# Run with coverage
npm run test -- --coverage
```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

## Commit Messages

Use conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Build process or auxiliary tool changes

Example: `feat: add support for new jailbreak pattern`

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Add tests
5. Ensure all tests pass (`npm test`)
6. Update documentation if needed
7. Submit a pull request

## Reporting Security Issues

Please do not open public issues for security vulnerabilities. Instead, email security@prompt-armor.dev.

## Questions?

Feel free to open an issue or discussion on GitHub.

Thank you for contributing! 🛡️
