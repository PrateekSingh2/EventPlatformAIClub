import { dedupeFinalTeams } from '@/lib/final-teams';
import { loadFinalTeams, replaceFinalTeams } from '@/lib/final-teams-db';

async function main() {
  const before = await loadFinalTeams();
  const after = dedupeFinalTeams(before);
  console.log(`final_teams: ${before.length} → ${after.length}`);
  await replaceFinalTeams(after);
  console.log('Saved deduped roster.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
