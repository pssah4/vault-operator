/**
 * Lightweight input schema validator for tool inputs (AUDIT-006 H-5).
 *
 * Validates:
 * 1. All required fields are present and non-undefined
 * 2. Field types match declared JSON Schema types
 * 3. Enum constraints are respected
 *
 * Does NOT validate: nested object schemas, pattern/format, oneOf/anyOf,
 * min/max constraints. This is a defense-in-depth measure, not a full
 * JSON Schema validator. No external dependencies.
 */

export interface SchemaValidationError {
    field: string;
    message: string;
}

interface PropertySchema {
    type?: string;
    enum?: unknown[];
}

interface ToolInputSchema {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
}

/**
 * Validate tool input against its declared input_schema.
 * Returns an array of validation errors (empty = valid).
 */
export function validateToolInput(
    input: Record<string, unknown>,
    schema: ToolInputSchema,
): SchemaValidationError[] {
    const errors: SchemaValidationError[] = [];

    // 1. Check required fields
    for (const field of schema.required ?? []) {
        if (input[field] === undefined || input[field] === null) {
            errors.push({ field, message: `Required field "${field}" is missing` });
        }
    }

    // 2. Coerce numeric strings to numbers (LLMs sometimes pass "0" instead of 0)
    for (const [field, value] of Object.entries(input)) {
        const propSchema = schema.properties?.[field] as PropertySchema | undefined;
        if (!propSchema?.type || value === undefined || value === null) continue;
        if (
            (propSchema.type === 'number' || propSchema.type === 'integer') &&
            typeof value === 'string' &&
            value.trim() !== '' &&
            !isNaN(Number(value))
        ) {
            input[field] = Number(value);
        }
    }

    // 3. Check types of provided fields
    for (const [field, value] of Object.entries(input)) {
        const propSchema = schema.properties?.[field] as PropertySchema | undefined;
        if (!propSchema?.type || value === undefined || value === null) continue;

        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const expectedType = propSchema.type;

        // JSON Schema type mapping
        const typeMatch =
            (expectedType === 'string' && actualType === 'string') ||
            (expectedType === 'number' && actualType === 'number') ||
            (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value as number)) ||
            (expectedType === 'boolean' && actualType === 'boolean') ||
            (expectedType === 'array' && actualType === 'array') ||
            (expectedType === 'object' && actualType === 'object');

        if (!typeMatch) {
            errors.push({
                field,
                message: `Field "${field}" expected type "${expectedType}" but got "${actualType}"`,
            });
        }

        // 3. Check enum constraints
        if (propSchema.enum && !propSchema.enum.includes(value)) {
            errors.push({
                field,
                message: `Field "${field}" value "${typeof value === 'string' ? value : JSON.stringify(value)}" is not in allowed values: ${propSchema.enum.map(String).join(', ')}`,
            });
        }
    }

    return errors;
}
