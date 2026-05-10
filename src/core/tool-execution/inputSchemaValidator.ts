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

    // 2. Coerce stringified inputs back to their declared JSON type. Some LLMs
    // (notably GPT/Copilot variants) serialize complex parameters as JSON
    // strings even when the schema declares `type: "array"` or `"object"`, and
    // numeric params as strings like "0". Do the conversion in-place so tools
    // see the declared type instead of hard-failing on a format quirk.
    for (const [field, value] of Object.entries(input)) {
        const propSchema = schema.properties?.[field] as PropertySchema | undefined;
        if (!propSchema?.type || value === undefined || value === null) continue;
        if (typeof value !== 'string') continue;

        if (
            (propSchema.type === 'number' || propSchema.type === 'integer') &&
            /^-?\d+(\.\d+)?$/.test(value.trim())
        ) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                input[field] = num;
            }
            continue;
        }

        if (propSchema.type === 'array' || propSchema.type === 'object') {
            const trimmed = value.trim();
            const looksLikeJson =
                (propSchema.type === 'array' && trimmed.startsWith('[')) ||
                (propSchema.type === 'object' && trimmed.startsWith('{'));
            if (!looksLikeJson) continue;
            try {
                const parsed = JSON.parse(trimmed);
                const parsedType = Array.isArray(parsed) ? 'array' : typeof parsed;
                if (parsedType === propSchema.type) {
                    input[field] = parsed;
                }
            } catch { /* leave the string in place -- type check below will flag it */ }
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
            (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value)) ||
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
