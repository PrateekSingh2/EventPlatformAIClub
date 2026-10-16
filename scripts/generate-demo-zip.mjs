import { ZipWriter, BlobWriter, TextReader } from '../apps/web/node_modules/@zip.js/zip.js/index.js';
import fs from 'fs';
import path from 'path';

async function generateDemoZips() {
  const publicDir = path.resolve('apps/web/public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. OPEN STAGE 1 ZIP
  const zipWriter1 = new ZipWriter(new BlobWriter('application/zip'));

  const readmeContent = `# Stage 1: Neural Anomaly Extraction & Data Decryption

Welcome to the **EventPlatform AI Club Contest Arena**.

### Objective
Inspect the accompanying files to deduce the anomaly boundary:
- Examine \`sensor_metrics.csv\` for cluster variances.
- Verify model configuration in \`model_architecture.py\`.
- Obtain the authorized AI system prompt from \`ai_prompt.txt\`.

### Anomaly Matrix
| Metric | Baseline | Observed Deviation | Status |
| :--- | :--- | :--- | :--- |
| Cluster Alpha | 1.024 | +0.042 ms | CRITICAL |
| Cluster Beta | 0.985 | -0.012 ms | NOMINAL |
| Cluster Gamma | 1.150 | +0.284 ms | ELEVATED |

---

### 🔑 Next Stage Decryption Key Clue
To clear this stage and unlock **Stage 2**, you must deduce the password of the Stage 2 archive.
> **Clue:** Combine the contest network keyword \`cyber\` with the current event year \`2026\` (i.e. \`cyber2026\`).
Click the **"Unlock Next Stage"** button above, enter this password, and unlock the next archive!
`;
  await zipWriter1.add('README.md', new TextReader(readmeContent));

  const promptContent = `SYSTEM DIRECTIVE:
You are an Elite Reverse Engineering AI Agent.
Analyze the latent dataset in 'sensor_metrics.csv' and identify all outlier clusters where sigma > 3.2.
Target Parameter: allowed_copy_filename
Anomaly Threshold: 0.042 ms
Stage 2 Password Hint: cyber2026
Output the reconstructed parameter matrix in JSON format.`;
  await zipWriter1.add('ai_prompt.txt', new TextReader(promptContent));

  const csvContent = `timestamp,sensor_id,voltage,temperature_c,anomaly_score,cluster_label
2026-10-16T10:00:01Z,SEN-01,3.31,42.5,0.012,Cluster_A
2026-10-16T10:00:02Z,SEN-02,3.29,43.1,0.015,Cluster_A
2026-10-16T10:00:03Z,SEN-03,3.34,42.8,0.011,Cluster_A
2026-10-16T10:00:04Z,SEN-04,3.28,45.2,0.042,Cluster_Alpha_Anomaly
2026-10-16T10:00:05Z,SEN-05,3.30,42.9,0.014,Cluster_A
2026-10-16T10:00:06Z,SEN-06,3.32,43.0,0.013,Cluster_A
2026-10-16T10:00:07Z,SEN-07,3.25,48.6,0.284,Cluster_Gamma_Elevated
2026-10-16T10:00:08Z,SEN-08,3.31,42.6,0.012,Cluster_A
2026-10-16T10:00:09Z,SEN-09,3.30,42.7,0.010,Cluster_A
2026-10-16T10:00:10Z,SEN-10,3.29,43.3,0.018,Cluster_B
2026-10-16T10:00:11Z,SEN-11,3.33,42.5,0.009,Cluster_B
2026-10-16T10:00:12Z,SEN-12,3.32,43.2,0.016,Cluster_B`;
  await zipWriter1.add('sensor_metrics.csv', new TextReader(csvContent));

  const pythonContent = `import torch
import torch.nn as nn

class AnomalyDetector(nn.Module):
    """Deep autoencoder for high-throughput anomaly classification."""
    def __init__(self, input_dim=6, latent_dim=2):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 16),
            nn.GELU(),
            nn.Linear(16, latent_dim)
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 16),
            nn.GELU(),
            nn.Linear(16, input_dim)
        )

    def forward(self, x):
        z = self.encoder(x)
        return self.decoder(z)

if __name__ == '__main__':
    model = AnomalyDetector()
    print("Model initialized for Stage 1 evaluation.")
`;
  await zipWriter1.add('model_architecture.py', new TextReader(pythonContent));

  const blob1 = await zipWriter1.close();
  const buffer1 = Buffer.from(await blob1.arrayBuffer());
  const path1 = path.join(publicDir, 'demo-stage-1.zip');
  fs.writeFileSync(path1, buffer1);
  console.log(`Generated open archive at ${path1} (${buffer1.length} bytes)`);

  // 2. ENCRYPTED STAGE 2 ZIP (Password: cyber2026)
  const zipWriter2 = new ZipWriter(new BlobWriter('application/zip'));
  await zipWriter2.add(
    'classified_brief.md',
    new TextReader(`# Stage 2 Classified Briefing

Congratulations! You successfully decrypted Stage 2 using password: \`cyber2026\`.

### Advanced Challenge
The quantum telemetry stream has been decrypted in client RAM.
Next stage archive password hint: \`quantum4096\`.
`),
    { password: 'cyber2026' }
  );
  await zipWriter2.add(
    'ai_prompt_stage2.txt',
    new TextReader(`STAGE 2 SYSTEM PROMPT:
Analyze the quantum state vector matrix.
Stage 3 Decryption Password: quantum4096
Allowed Copy File for Stage 2.`),
    { password: 'cyber2026' }
  );
  await zipWriter2.add(
    'quantum_telemetry.csv',
    new TextReader(`qubit_index,fidelity,error_rate,phase_shift
0,0.9994,0.0006,+0.002
1,0.9989,0.0011,-0.004
2,0.9991,0.0009,+0.001
3,0.9975,0.0025,+0.015
4,0.9998,0.0002,-0.001`),
    { password: 'cyber2026' }
  );
  const blob2 = await zipWriter2.close();
  const buffer2 = Buffer.from(await blob2.arrayBuffer());
  const path2 = path.join(publicDir, 'demo-stage-2-encrypted.zip');
  fs.writeFileSync(path2, buffer2);
  console.log(`Generated encrypted archive at ${path2} (${buffer2.length} bytes, password: cyber2026)`);

  // 3. ENCRYPTED STAGE 3 ZIP (Password: quantum4096)
  const zipWriter3 = new ZipWriter(new BlobWriter('application/zip'));
  await zipWriter3.add(
    'final_stage_victory.md',
    new TextReader(`# Stage 3: Master Architecture Unlocked!

Outstanding work! You have cleared all stages and reached the pinnacle of the contest arena!
All archives decrypted strictly in browser memory with zero disk leak.`),
    { password: 'quantum4096' }
  );
  const blob3 = await zipWriter3.close();
  const buffer3 = Buffer.from(await blob3.arrayBuffer());
  const path3 = path.join(publicDir, 'demo-stage-3-encrypted.zip');
  fs.writeFileSync(path3, buffer3);
  console.log(`Generated encrypted archive at ${path3} (${buffer3.length} bytes, password: quantum4096)`);
}

generateDemoZips().catch(console.error);
