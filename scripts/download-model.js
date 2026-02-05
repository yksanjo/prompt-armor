#!/usr/bin/env node

/**
 * Download script for Prompt Armor ONNX model
 * 
 * Usage:
 *   node download-model.js [--version v1.0.0] [--output ./models]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_VERSION = process.argv.includes('--version') 
  ? process.argv[process.argv.indexOf('--version') + 1] 
  : 'v1.0.0';

const OUTPUT_DIR = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : path.join(__dirname, '..', 'models');

const MODEL_URL = `https://models.prompt-armor.dev/${MODEL_VERSION}/prompt-classifier.onnx`;
const CONFIG_URL = `https://models.prompt-armor.dev/${MODEL_VERSION}/config.json`;
const VOCAB_URL = `https://models.prompt-armor.dev/${MODEL_VERSION}/vocab.json`;

const files = [
  { url: MODEL_URL, filename: 'prompt-classifier.onnx', required: true },
  { url: CONFIG_URL, filename: 'config.json', required: false },
  { url: VOCAB_URL, filename: 'vocab.json', required: false }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${path.basename(dest)}...`);
    
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloaded / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  Progress: ${percent}%`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n  ✓ Download complete');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadModel() {
  console.log(`\n📦 Prompt Armor Model Downloader`);
  console.log(`   Version: ${MODEL_VERSION}`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check for local fallback files
  const localModelPath = path.join(OUTPUT_DIR, 'prompt-classifier.onnx');
  
  if (fs.existsSync(localModelPath)) {
    const stats = fs.statSync(localModelPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`✓ Model already exists (${sizeMB} MB)`);
    console.log(`  ${localModelPath}\n`);
    return;
  }

  // Try to download from remote
  let downloadSuccess = true;
  
  for (const file of files) {
    const dest = path.join(OUTPUT_DIR, file.filename);
    
    try {
      await downloadFile(file.url, dest);
    } catch (error) {
      console.error(`\n  ✗ Failed: ${error.message}`);
      
      if (file.required) {
        downloadSuccess = false;
      }
      
      // Clean up partial download
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
    }
  }

  if (!downloadSuccess) {
    console.log('\n⚠️  Remote download failed. Using fallback...\n');
    createFallbackModel();
  }

  console.log('\n✅ Model setup complete!\n');
}

function createFallbackModel() {
  // Create a placeholder/stub model for development
  // In production, this would create a minimal ONNX model
  
  const fallbackMessage = `
=============================================================================
FALLBACK MODE: Creating stub model for development

The full model could not be downloaded. A stub model has been created that
will fall back to heuristic detection only.

To use the full ML-based detection:
1. Download the model manually from: https://prompt-armor.dev/models
2. Place it in: ${OUTPUT_DIR}
3. Re-run your application

Note: Heuristic detection is still fully functional and provides excellent
protection against known prompt injection patterns.
=============================================================================
`;

  console.log(fallbackMessage);

  // Create a minimal stub file
  const stubPath = path.join(OUTPUT_DIR, 'prompt-classifier.onnx.stub');
  fs.writeFileSync(stubPath, 'STUB_MODEL_FALLBACK_TO_HEURISTICS');
}

// Run
if (require.main === module) {
  downloadModel().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { downloadModel };
