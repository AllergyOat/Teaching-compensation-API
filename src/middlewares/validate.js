export const validate = (schema) => async (req, res, next) => {
  try {
    // Handle direct schema (like updateStatusSchema) or object with body/params/query
    if (schema.safeParse || schema.parseAsync) {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        console.log("Validation failed:", result.error.flatten());
        return res.status(400).json({
          message: "Validation failed",
          errors: result.error.flatten().fieldErrors,
        });
      }
      req.body = result.data;
      console.log("Validation passed - Validated body:", req.body);
    } else {
      if (schema.body) req.body = await schema.body.parseAsync(req.body);
      if (schema.params)
        req.params = await schema.params.parseAsync(req.params);
      if (schema.query) req.query = await schema.query.parseAsync(req.query);
    }

    next();
  } catch (err) {
    console.error("Validation error:", err);
    if (err.errors) {
      return res.status(400).json({
        message: "Validation failed",
        errors: err.errors,
      });
    }
    next(err);
  }
};
