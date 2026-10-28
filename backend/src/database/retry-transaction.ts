/** Only retry transactions PostgreSQL/Prisma definitively rolled back. Never retry ambiguous commits. */
export async function retryTransaction<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const e = error as {
        code?: string;
        meta?: {
          code?: string;
          driverAdapterError?: { cause?: { originalCode?: string } };
        };
      };
      const code =
        e.meta?.code ??
        e.meta?.driverAdapterError?.cause?.originalCode ??
        e.code;
      if (attempt >= 2 || !['P2034', '40001', '40P01'].includes(code ?? ''))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
