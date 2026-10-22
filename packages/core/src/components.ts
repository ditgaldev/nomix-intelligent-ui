// Selected from vercel-labs/json-render v0.21.1 packages/shadcn/src/catalog.ts.
// Copyright Vercel, Inc. Licensed under Apache-2.0. See THIRD_PARTY_NOTICES.md.
import { z } from "zod";

// =============================================================================
// Shared validation schemas used across form components
// =============================================================================

const validationCheckSchema = z
  .array(
    z.object({
      type: z.string(),
      message: z.string(),
      args: z.record(z.string(), z.unknown()).optional(),
    }),
  )
  .nullable();

const validateOnSchema = z.enum(["change", "blur", "submit"]).nullable();


export const baseComponents = {
  Stack: {
    props: z.object({
      direction: z.enum(["horizontal", "vertical"]).nullable(),
      gap: z.enum(["none", "sm", "md", "lg", "xl"]).nullable(),
      align: z.enum(["start", "center", "end", "stretch"]).nullable(),
      justify: z
        .enum(["start", "center", "end", "between", "around"])
        .nullable(),
      className: z.string().nullable().describe("Additional CSS classes"),
    }),
    slots: ["default"],
    description: "Flex container for layouts",
    example: { direction: "vertical", gap: "md" },
  },
  Grid: {
    props: z.object({
      columns: z.number().nullable(),
      gap: z.enum(["sm", "md", "lg", "xl"]).nullable(),
      className: z.string().nullable().describe("Additional CSS classes"),
    }),
    slots: ["default"],
    description: "Grid layout (1-6 columns)",
    example: { columns: 3, gap: "md" },
  },
  Card: {
    props: z.object({
      title: z.string().nullable(),
      description: z.string().nullable(),
      maxWidth: z.enum(["sm", "md", "lg", "full"]).nullable(),
      centered: z.boolean().nullable(),
      className: z.string().nullable().describe("Additional CSS classes"),
    }),
    slots: ["default"],
    description:
      "Container card for content sections. Use for forms/content boxes, NOT for page headers.",
    example: { title: "Overview", description: "Your account summary" },
  },
  Heading: {
    props: z.object({
      text: z.string(),
      level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
    }),
    description: "Heading text (h1-h4)",
    example: { text: "Welcome", level: "h1" },
  },
  Text: {
    props: z.object({
      text: z.string(),
      variant: z.enum(["body", "caption", "muted", "lead", "code"]).nullable(),
    }),
    description: "Paragraph text",
    example: { text: "Hello, world!" },
  },
  Badge: {
    props: z.object({
      text: z.string(),
      variant: z
        .enum(["default", "secondary", "destructive", "outline"])
        .nullable(),
    }),
    description: "Status badge",
    example: { text: "Active", variant: "default" },
  },
  Separator: {
    props: z.object({
      orientation: z.enum(["horizontal", "vertical"]).nullable(),
    }),
    description: "Visual separator line",
  },
  Button: {
    props: z.object({
      label: z.string(),
      variant: z.enum(["primary", "secondary", "danger"]).nullable(),
      disabled: z.boolean().nullable(),
    }),
    events: ["press"],
    description: "Clickable button. Bind on.press for handler.",
    example: { label: "Submit", variant: "primary" },
  },
  Input: {
    props: z.object({
      label: z.string(),
      name: z.string(),
      type: z.enum(["text", "email", "password", "number"]).nullable(),
      placeholder: z.string().nullable(),
      value: z.string().nullable(),
      checks: validationCheckSchema,
      validateOn: validateOnSchema,
    }),
    events: ["submit", "focus", "blur"],
    description:
      "Text input field. Use { $bindState } on value for two-way binding. Use checks for validation (e.g. required, email, minLength). validateOn controls timing (default: blur).",
    example: {
      label: "Email",
      name: "email",
      type: "email",
      placeholder: "you@example.com",
    },
  },
  Select: {
    props: z.object({
      label: z.string(),
      name: z.string(),
      options: z.array(z.string()),
      placeholder: z.string().nullable(),
      value: z.string().nullable(),
      checks: validationCheckSchema,
      validateOn: validateOnSchema,
    }),
    events: ["change"],
    description:
      "Dropdown select input. Use { $bindState } on value for binding. Use checks for validation. validateOn controls timing (default: change).",
  },
  Checkbox: {
    props: z.object({
      label: z.string(),
      name: z.string(),
      checked: z.boolean().nullable(),
      checks: validationCheckSchema,
      validateOn: validateOnSchema,
    }),
    events: ["change"],
    description:
      "Checkbox input. Use { $bindState } on checked for binding. Use checks for validation. validateOn controls timing (default: change).",
  },
  Table: {
    props: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      caption: z.string().nullable(),
    }),
    description:
      'Data table. columns: header labels. rows: 2D array of cell strings, e.g. [["Alice","admin"],["Bob","user"]].',
    example: {
      columns: ["Name", "Role"],
      rows: [
        ["Alice", "Admin"],
        ["Bob", "User"],
      ],
    },
  },
};
