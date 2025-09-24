import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  // Zod validation
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: err.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
    });
  }

  // Prisma unique error
  if (err?.code === 'P2002') {
    return res.status(409).json({ message: 'Record already exists', meta: err.meta });
  }

  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
}
