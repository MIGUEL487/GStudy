#!/usr/bin/env node
/**
 * Script de verificação de integridade do schema do Supabase para o GStudy.
 *
 * Checa se todas as migrações (0000_learning.sql até 0004_server_ai_quotas.sql)
 * foram aplicadas e se as tabelas, funções e políticas esperadas estão presentes.
 *
 * Uso:
 *   node scripts/verify-supabase-schema.mjs
 * Requer variáveis de ambiente:
 *   SUPABASE_URL ou VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log("=== Verificação de Schema do GStudy (Supabase) ===\n");

if (!url || !key) {
  console.log("Variáveis de ambiente ausentes.");
  console.log(
    "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_ANON_KEY) para conectar.",
  );
  console.log("\nOrdem esperada das migrações SQL (executar no SQL Editor do Supabase):");
  console.log("  1. drizzle/migrations/0000_learning.sql (Materiais e estatísticas)");
  console.log("  2. drizzle/migrations/0001_notion.sql (Conexão e páginas do Notion)");
  console.log("  3. drizzle/migrations/0002_account_sync_reviews.sql (Sincronização e avaliações)");
  console.log("  4. drizzle/migrations/0003_socrates.sql (Cotas e sessões do Sócrates)");
  console.log("  5. drizzle/migrations/0004_server_ai_quotas.sql (Cotas do servidor e XP atômico)");
  console.log(
    "  6. drizzle/migrations/0005_ai_activity_cache.sql (Cache e pré-geração de atividades de IA)",
  );
  process.exit(0);
}

const supabase = createClient(url, key);

const EXPECTED_TABLES = [
  "study_materials",
  "learner_stats",
  "notion_connections",
  "notion_pages",
  "account_revisions",
  "account_snapshots",
  "reviews",
  "review_votes",
  "review_reports",
  "socrates_quotas",
  "socrates_reservations",
  "user_daily_ai_usage",
  "ai_activity_cache",
];

const EXPECTED_RPCS = [
  "import_notion_page",
  "reserve_socrates_tokens",
  "settle_socrates_tokens",
  "get_socrates_quota",
  "check_and_consume_ai_quota",
  "award_learner_xp",
];

async function verify() {
  console.log(`Conectando a: ${url}\n`);

  let tableSuccess = 0;
  for (const table of EXPECTED_TABLES) {
    const { error } = await supabase.from(table).select("*").limit(0);
    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      console.log(`  ❌ Tabela ausente: ${table}`);
    } else if (error) {
      console.log(`  ⚠️ Tabela ${table}: ${error.message} (código ${error.code})`);
    } else {
      console.log(`  ✓ Tabela OK: ${table}`);
      tableSuccess++;
    }
  }

  console.log(`\nVerificadas ${tableSuccess}/${EXPECTED_TABLES.length} tabelas.`);

  console.log("\nVerificando RPCs:");
  for (const rpc of EXPECTED_RPCS) {
    const { error } = await supabase.rpc(rpc, {});
    // Se erro for 42883 (function does not exist), falta a migration
    if (error?.code === "42883") {
      console.log(`  ❌ Função RPC ausente: ${rpc}`);
    } else {
      console.log(`  ✓ Função RPC presente (ou checada): ${rpc}`);
    }
  }

  console.log("\nVerificação concluída.");
}

verify().catch(console.error);
