import { cssInterop } from "nativewind";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Eye,
  Maximize,
  Menu,
  Moon,
  Palette,
  Pause,
  PenLine,
  Play,
  Sun,
  X,
} from "lucide-react-native";
import type { ComponentType } from "react";

function iconWithClassName(icon: ComponentType<any>) {
  cssInterop(icon, {
    className: {
      target: "style",
      nativeStyleToProp: {
        color: true,
        opacity: true,
      },
    },
  });
}

iconWithClassName(ArrowLeft);
iconWithClassName(ChevronDown);
iconWithClassName(Download);
iconWithClassName(Eye);
iconWithClassName(Maximize);
iconWithClassName(Menu);
iconWithClassName(Moon);
iconWithClassName(Palette);
iconWithClassName(Pause);
iconWithClassName(PenLine);
iconWithClassName(Play);
iconWithClassName(Sun);
iconWithClassName(X);

export { ArrowLeft, ChevronDown, Download, Eye, Maximize, Menu, Moon, Palette, Pause, PenLine, Play, Sun, X };
