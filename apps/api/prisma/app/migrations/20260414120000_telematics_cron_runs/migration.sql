-- CreateEnum
CREATE TYPE "CronJobType" AS ENUM ('SAMSARA_DAILY', 'MOTIVE_DAILY');

-- CreateTable
CREATE TABLE "telematics_cron_runs" (
    "id" TEXT NOT NULL,
    "job" "CronJobType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "total_orgs" INTEGER NOT NULL,
    "success_orgs" INTEGER NOT NULL,
    "failed_orgs" INTEGER NOT NULL,
    "all_succeeded" BOOLEAN NOT NULL,
    "report" JSONB NOT NULL,

    CONSTRAINT "telematics_cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telematics_cron_runs_job_started_at_idx" ON "telematics_cron_runs"("job", "started_at" DESC);
