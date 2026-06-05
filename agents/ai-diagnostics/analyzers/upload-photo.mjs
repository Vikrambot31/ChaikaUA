import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'upload-photo';

/**
 * Returns true when a line merely declares, imports, or aliases a symbol
 * rather than actually calling it. This prevents false positives on:
 *   import { uploadBytes, getDownloadURL } from '...'
 *   const alias = uploadBytes as (...)
 *   // comment mentioning getDownloadURL
 *   ['get', 'DownloadURL'].join('')   (obfuscated reference)
 */
const isNonCallLine = (line) => {
  if (/^\s*import\s/.test(line)) return true;
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return true;
  if (/=\s*\w+\s+as\s+[\s(]/.test(line)) return true;
  if (/\[.*\]\.join\s*\(/.test(line)) return true;
  return false;
};

export function analyze(files) {
  const findings = [];

  for (const file of files) {
    const { relativePath, content, lines } = file;

    // 1. missing-upload-catch (HIGH)
    lines.forEach((line, i) => {
      if (/upload(Bytes|BytesResumable|String)|putFile/.test(line) && !isNonCallLine(line)) {
        // Wider context window (±8) to catch wrapping try/catch blocks
        const contextWindow = lines.slice(Math.max(0, i - 8), Math.min(i + 8, lines.length)).join('\n');
        if (!/\.catch|catch\s*\(|try\s*\{/.test(contextWindow)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'missing-upload-catch', scanner: SCANNER,
            why: 'Upload operation without error handling',
            risk: 'Upload failure silently drops user data, no retry or feedback',
            uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Wrap upload in try/catch with user feedback and retry logic',
          }));
        }
      }
    });

    // 2. picker-no-cancel-check (MEDIUM)
    lines.forEach((line, i) => {
      if (/launchImageLibrary|launchCamera|ImagePicker\.launch/.test(line)) {
        const context = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
        if (!/didCancel|cancel|\.cancelled/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'picker-no-cancel-check', scanner: SCANNER,
            why: 'Image picker result not checked for user cancellation',
            risk: 'Proceeding with undefined image data after user cancels picker',
            uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Check result.didCancel before processing picked image',
          }));
        }
      }
    });

    // 3. missing-upload-progress (MEDIUM)
    lines.forEach((line, i) => {
      if (/uploadBytesResumable/.test(line)) {
        const context = lines.slice(i, Math.min(i + 12, lines.length)).join('\n');
        if (!/state_changed|onProgress|\.on\(/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'missing-upload-progress', scanner: SCANNER,
            why: 'Resumable upload without progress tracking',
            risk: 'User sees no upload progress indicator, may think app is frozen',
            uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Add on("state_changed") listener to show upload progress',
          }));
        }
      }
    });

    // 4. thumbnail-sync-generation (HIGH)
    lines.forEach((line, i) => {
      if (/resizeSync|writeFileSync/.test(line)) {
        const contextBefore = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
        if (/sharp|jimp|canvas|image|Image|resize|thumbnail/i.test(contextBefore)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'thumbnail-sync-generation', scanner: SCANNER,
            why: 'Synchronous image manipulation blocks the main thread',
            risk: 'UI freezes during image processing, ANR on Android',
            uxImpact: 'high', perfImpact: 'high', memoryImpact: 'medium',
            suggestion: 'Use async image manipulation APIs or offload to a worker',
          }));
        }
      }
    });

    // 5. storage-url-no-error (HIGH)
    lines.forEach((line, i) => {
      if (/getDownloadURL/.test(line) && !isNonCallLine(line)) {
        // Wider context window (±8) to catch wrapping try/catch blocks
        const contextWindow = lines.slice(Math.max(0, i - 8), Math.min(i + 8, lines.length)).join('\n');
        if (!/\.catch|catch\s*\(|try\s*\{/.test(contextWindow)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'storage-url-no-error', scanner: SCANNER,
            why: 'getDownloadURL without error handling',
            risk: 'Missing/deleted file crashes UI or shows broken image',
            uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Wrap getDownloadURL in try/catch, provide fallback image URL',
          }));
        }
      }
    });

    // 6. upload-no-timeout (MEDIUM)
    lines.forEach((line, i) => {
      if (/upload(Bytes|BytesResumable|String)|putFile/.test(line) && !isNonCallLine(line)) {
        // Look at the entire function context (30 lines around)
        const funcContext = lines.slice(Math.max(0, i - 15), Math.min(i + 15, lines.length)).join('\n');
        if (!/AbortController|timeout|setTimeout|signal/.test(funcContext)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'upload-no-timeout', scanner: SCANNER,
            why: 'Upload operation without timeout or abort mechanism',
            risk: 'Upload hangs indefinitely on poor network, user stuck waiting',
            uxImpact: 'medium', perfImpact: 'low', memoryImpact: 'none',
            suggestion: 'Add AbortController with timeout to cancel stalled uploads',
          }));
        }
      }
    });

    // 7. modal-race-condition (MEDIUM)
    // Lowered from HIGH: pattern is too broad — many valid patterns trigger it
    // Only flag if modal toggle is inside an async callback without any guard or try/catch
    lines.forEach((line, i) => {
      if (/set(Visible|Show|Open|Modal)\s*\(\s*(true|false)/.test(line)) {
        const funcBlock = lines.slice(Math.max(0, i - 15), Math.min(i + 15, lines.length)).join('\n');
        if (/upload|Upload|putFile|uploadBytes/.test(funcBlock) &&
            !/mounted|cancelled|isMounted|aborted|try\s*\{|\.catch/.test(funcBlock)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'modal-race-condition', scanner: SCANNER,
            why: 'Modal state change near async upload without error guard',
            risk: 'setState on unmounted component if user closes modal during upload',
            uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'low',
            suggestion: 'Add isMounted ref or AbortController check before state updates after async ops',
          }));
        }
      }
    });

    // 8. image-no-dimensions-check (LOW)
    lines.forEach((line, i) => {
      if (/launchImageLibrary|launchCamera|ImagePicker\.launch/.test(line)) {
        const context = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        if (!/width|height|fileSize|size/.test(context)) {
          findings.push(createFinding({
            severity: 'LOW', file: relativePath, line: i + 1, rule: 'image-no-dimensions-check', scanner: SCANNER,
            why: 'Image picker usage without checking dimensions or file size',
            risk: 'Oversized images uploaded, wasting bandwidth and storage',
            uxImpact: 'low', perfImpact: 'medium', memoryImpact: 'medium',
            suggestion: 'Validate image width, height, and fileSize before uploading',
          }));
        }
      }
    });

    // 9. stuck-upload-state (MEDIUM)
    // Lowered from HIGH: 25-line window often misses finally blocks in longer functions
    // Extended window to 60 lines; downgraded severity since detection is heuristic
    lines.forEach((line, i) => {
      const match = line.match(/set(Uploading|Loading|Saving|Submitting)\s*\(\s*true\s*\)/);
      if (match) {
        const context = lines.slice(i, Math.min(i + 60, lines.length)).join('\n');
        const setterName = `set${match[1]}`;
        const hasCatchReset = new RegExp(`(catch|finally)[\\s\\S]*?${setterName}\\s*\\(\\s*false`).test(context);
        const hasFinally = /finally\s*\{/.test(context);
        // Also skip if there's a general finally reset pattern (any setter false in finally)
        const hasFinallyAnyReset = /finally\s*\{[\s\S]*?set\w+\s*\(\s*false/.test(context);
        if (!hasCatchReset && !hasFinally && !hasFinallyAnyReset) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'stuck-upload-state', scanner: SCANNER,
            why: `${setterName}(true) without detected ${setterName}(false) in catch/finally`,
            risk: 'Loading spinner may get stuck if operation fails and no reset is guaranteed',
            uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
            suggestion: `Add finally block with ${setterName}(false) to guarantee state reset`,
          }));
        }
      }
    });
  }

  return findings;
}
