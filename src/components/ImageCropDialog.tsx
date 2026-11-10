import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { Loader2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cropToFile, type CropArea } from "@/lib/crop-image";

/**
 * Lets the member drag and zoom a picture before it is uploaded.
 * `file` opens the dialog; onDone gets the cropped picture, onCancel closes without uploading.
 */
export function ImageCropDialog({ file, round = false, title = "قص الصورة", onDone, onCancel }: {
  file: File | null; round?: boolean; title?: string;
  onDone: (cropped: File) => void | Promise<void>; onCancel: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setSrc(null); return; }
    const url = URL.createObjectURL(file);
    setSrc(url); setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save() {
    if (!src || !area || !file) return;
    setBusy(true);
    try { await onDone(await cropToFile(src, area, file.name, rotation)); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!file} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-w-md gap-3 p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>حرّك الصورة وكبّرها لحد ما تختار الجزء اللي عايزه.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
          {src && (
            <Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={1} cropShape={round ? "round" : "rect"}
              showGrid={!round} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
          )}
        </div>
        <div className="flex items-center gap-2" dir="ltr">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Slider aria-label="تكبير" min={1} max={3} step={0.01} value={[zoom]} onValueChange={([z]) => setZoom(z ?? 1)} />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="لف الصورة"
            onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!area || busy} onClick={save}>
            {busy && <Loader2 className="size-4 animate-spin" />} حفظ
          </Button>
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onCancel}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
