import { cssInterop } from "nativewind";
import {
  ArrowLeft,
  Maximize,
  Menu,
  Pause,
  Play,
  X,
} from "lucide-react-native";

function iconWithClassName(icon: React.ComponentType<any>) {
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
iconWithClassName(Maximize);
iconWithClassName(Menu);
iconWithClassName(Pause);
iconWithClassName(Play);
iconWithClassName(X);

export { ArrowLeft, Maximize, Menu, Pause, Play, X };
