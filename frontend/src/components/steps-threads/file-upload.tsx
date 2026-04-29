"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface FileUploadProps {
  onFileLoaded: (content: string, filename: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function FileUpload({ onFileLoaded, onError, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [".txt", ".md", ".html", ".htm"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!allowedTypes.includes(ext)) {
      onError("지원하지 않는 파일 형식입니다. (.txt, .md, .html)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onError("파일 크기는 5MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      onFileLoaded(text, file.name);
    };
    reader.onerror = () => {
      onError("파일을 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsText(file);

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.html,.htm"
        onChange={handleFile}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        파일 불러오기
      </Button>
    </>
  );
}
