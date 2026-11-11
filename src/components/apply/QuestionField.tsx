"use client";

import { useId } from "react";
import { Lightning } from "@phosphor-icons/react/ssr";
import type { AnswerValue, FormQuestion } from "@/lib/applications/form";
import { DEFAULT_MAX_LENGTH } from "@/lib/applications/form";
import { FileUpload, type UploadedFile } from "@/components/apply/FileUpload";

interface Props {
  q: FormQuestion;
  value: AnswerValue | undefined;
  error?: string;
  onChange: (v: AnswerValue) => void;
  uploads: Record<string, UploadedFile>;
  onUploaded: (f: UploadedFile) => void;
}

export function QuestionField({ q, value, error, onChange, uploads, onUploaded }: Props) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [q.helpText ? helpId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;

  const label = (
    <span className="flex flex-wrap items-center gap-2">
      {q.type === "SCENARIO" && (
        <span className="nv-pill nv-pill-red !text-[0.65rem] !py-0.5 !px-2">
          <Lightning size={11} weight="fill" aria-hidden /> Szenario
        </span>
      )}
      <span>
        {q.label}
        {!q.required && <span className="ml-1.5 text-xs font-normal text-muted">(optional)</span>}
      </span>
    </span>
  );

  const help = q.helpText ? (
    <p id={helpId} className="nv-help mt-1 mb-2">
      {q.helpText}
    </p>
  ) : null;
  const err = error ? (
    <p id={errId} className="nv-error mt-1.5" role="alert">
      {error}
    </p>
  ) : null;

  switch (q.type) {
    case "SHORT_TEXT":
    case "URL":
    case "NUMBER":
      return (
        <div>
          <label htmlFor={id} className="nv-field-label">
            {label}
          </label>
          {help}
          <input
            id={id}
            className="nv-input mt-1"
            type={q.type === "URL" ? "url" : q.type === "NUMBER" ? "number" : "text"}
            inputMode={q.type === "NUMBER" ? "numeric" : q.type === "URL" ? "url" : undefined}
            value={value === null || value === undefined ? "" : String(value)}
            placeholder={q.placeholder ?? undefined}
            maxLength={q.type === "NUMBER" ? undefined : (q.maxLength ?? DEFAULT_MAX_LENGTH[q.type])}
            min={q.minValue ?? undefined}
            max={q.maxValue ?? undefined}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            aria-required={q.required}
            autoComplete="off"
            onChange={(e) =>
              onChange(q.type === "NUMBER" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
            }
          />
          {err}
        </div>
      );

    case "LONG_TEXT":
    case "SCENARIO": {
      const text = typeof value === "string" ? value : "";
      const len = text.trim().length;
      const max = q.maxLength ?? DEFAULT_MAX_LENGTH[q.type]!;
      const min = q.minLength ?? 0;
      return (
        <div>
          <label htmlFor={id} className="nv-field-label">
            {label}
          </label>
          {help}
          <textarea
            id={id}
            className="nv-input mt-1"
            rows={q.type === "SCENARIO" ? 6 : 5}
            value={text}
            placeholder={q.placeholder ?? undefined}
            maxLength={max}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            aria-required={q.required}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">{err}</div>
            <p className={`shrink-0 text-xs tabular-nums ${min && len < min ? "text-faint" : "text-muted"}`} aria-live="off">
              {min > 0 && len < min ? `${len} / mind. ${min}` : `${len} / ${max}`}
            </p>
          </div>
        </div>
      );
    }

    case "SELECT": {
      const opts = q.options;
      if (opts.length > 6) {
        return (
          <div>
            <label htmlFor={id} className="nv-field-label">
              {label}
            </label>
            {help}
            <select
              id={id}
              className="nv-input mt-1"
              value={typeof value === "string" ? value : ""}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {opts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            {err}
          </div>
        );
      }
      return (
        <fieldset aria-describedby={describedBy}>
          <legend className="nv-field-label">{label}</legend>
          {help}
          <div className="mt-1 grid gap-2 sm:grid-cols-2" role="radiogroup">
            {opts.map((o) => {
              const checked = value === o;
              return (
                <label
                  key={o}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    checked ? "border-red-line bg-red-soft" : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    className="nv-check !mt-0"
                    name={id}
                    checked={checked}
                    onChange={() => onChange(o)}
                  />
                  <span className="text-sm">{o}</span>
                </label>
              );
            })}
          </div>
          {err}
        </fieldset>
      );
    }

    case "MULTI_SELECT": {
      const arr = Array.isArray(value) ? value : [];
      return (
        <fieldset aria-describedby={describedBy}>
          <legend className="nv-field-label">{label}</legend>
          {help}
          <div className="mt-1 flex flex-wrap gap-2">
            {q.options.map((o) => {
              const checked = arr.includes(o);
              return (
                <label
                  key={o}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm cursor-pointer transition-colors ${
                    checked ? "border-red-line bg-red-soft text-fg" : "border-line text-fg-2 hover:border-line-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => onChange(checked ? arr.filter((x) => x !== o) : [...arr, o])}
                  />
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${checked ? "bg-red" : "bg-[var(--nv-border-strong)]"}`}
                  />
                  {o}
                </label>
              );
            })}
          </div>
          {err}
        </fieldset>
      );
    }

    case "CHECKBOX":
      return (
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="nv-check"
              checked={value === true}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="text-sm font-medium">{label}</span>
          </label>
          {help}
          {err}
        </div>
      );

    case "FILE": {
      const ids = Array.isArray(value) ? value : [];
      return (
        <div>
          <p className="nv-field-label" id={`${id}-label`}>
            {label}
          </p>
          {help}
          <FileUpload
            questionId={q.id}
            labelledBy={`${id}-label`}
            ids={ids}
            files={uploads}
            onChange={(next) => onChange(next)}
            onUploaded={onUploaded}
          />
          {err}
        </div>
      );
    }
  }
}
