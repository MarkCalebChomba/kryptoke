"use client";

import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const icon =
  (path: React.ReactNode, viewBox = "0 0 24 24") =>
  ({ size = 24, className, ...props }: IconProps) =>
    (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    );

/* ─── Navigation ────────────────────────────────────────────────────────── */

export const IconHome = icon(
  <>
    <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
  </>
);

export const IconMarkets = icon(
  <>
    <path d="M3 17L8 12L12 16L16 9L21 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 9H21V13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconTrade = icon(
  <>
    <path d="M7 16L12 11L17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 8L12 13L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconEarn = icon(
  <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 6V12L15 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12H12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconProfile = icon(
  <>
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
    <path d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

/* ─── Actions ───────────────────────────────────────────────────────────── */

export const IconDeposit = icon(
  <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M8.5 12L12 15.5L15.5 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconWithdraw = icon(
  <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 17V9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M8.5 12L12 8.5L15.5 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconTransfer = icon(
  <>
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M15 8L19 12L15 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 8L5 12L9 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconHistory = icon(
  <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3.5 8.5L6 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconSend = icon(
  <>
    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconBuy = icon(
  <>
    <path d="M12 5V19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M5 12L12 19L19 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconSell = icon(
  <>
    <path d="M12 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M5 12L12 5L19 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconSwap = icon(
  <>
    <path d="M17 4L21 8L17 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 8H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 20L3 16L7 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 16H3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconCopy = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M5 15H4C3.44772 15 3 14.5523 3 14V4C3 3.44772 3.44772 3 4 3H14C14.5523 3 15 3.44772 15 4V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconScan = icon(
  <>
    <path d="M3 7V4C3 3.44772 3.44772 3 4 3H7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M17 3H20C20.5523 3 21 3.44772 21 4V7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M21 17V20C21 20.5523 20.5523 21 20 21H17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 21H4C3.44772 21 3 20.5523 3 20V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3 12H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

/* ─── UI Controls ───────────────────────────────────────────────────────── */

export const IconBell = icon(
  <>
    <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconMenu = icon(
  <>
    <path d="M3 6H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3 12H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3 18H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
    <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconFilter = icon(
  <>
    <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconX = icon(
  <>
    <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconCheck = icon(
  <>
    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChevronDown = icon(
  <>
    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChevronUp = icon(
  <>
    <path d="M18 15L12 9L6 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChevronRight = icon(
  <>
    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChevronLeft = icon(
  <>
    <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconArrowLeft = icon(
  <>
    <path d="M19 12H5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 5L5 12L12 19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconArrowRight = icon(
  <>
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconArrowUpRight = icon(
  <>
    <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 7H17V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconPlus = icon(
  <>
    <path d="M12 5V19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconMinus = icon(
  <>
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconEye = icon(
  <>
    <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
  </>
);

export const IconEyeOff = icon(
  <>
    <path d="M17.94 17.94C16.2306 19.243 14.1491 19.9649 12 20C5 20 1 12 1 12C2.24389 9.6819 3.96914 7.65661 6.06 6.06M9.9 4.24C10.5883 4.07888 11.2931 3.99834 12 4C19 4 23 12 23 12C22.393 13.1356 21.6691 14.2048 20.84 15.19M14.12 14.12C13.8454 14.4148 13.5141 14.6512 13.1462 14.8151C12.7782 14.9791 12.3809 15.0673 11.9781 15.0744C11.5753 15.0815 11.1752 15.0074 10.8016 14.8565C10.428 14.7056 10.0887 14.4811 9.80385 14.1962C9.51897 13.9113 9.29439 13.572 9.14351 13.1984C8.99262 12.8248 8.91853 12.4247 8.92563 12.0219C8.93274 11.6191 9.02091 11.2218 9.18488 10.8538C9.34884 10.4859 9.58525 10.1546 9.88 9.88" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1 1L23 23" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconAlertTriangle = icon(
  <>
    <path d="M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55101 19.3437 1.64151 19.6871 1.81445 19.9905C1.98738 20.2939 2.23675 20.5467 2.53773 20.7238C2.83871 20.9009 3.18082 20.9962 3.53 21H20.47C20.8192 20.9962 21.1613 20.9009 21.4623 20.7238C21.7633 20.5467 22.0126 20.2939 22.1856 19.9905C22.3585 19.6871 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56611 13.2807 3.32312 12.9812 3.15448C12.6817 2.98585 12.3437 2.89725 12 2.89725C11.6563 2.89725 11.3183 2.98585 11.0188 3.15448C10.7193 3.32312 10.4683 3.56611 10.29 3.86Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 9V13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </>
);

export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 16V11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
  </>
);

export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M19.4 15C19.1277 15.6171 19.2583 16.3378 19.73 16.82L19.79 16.88C20.1249 17.2149 20.3142 17.6686 20.3142 18.14C20.3142 18.6114 20.1249 19.0651 19.79 19.4C19.4551 19.7349 19.0014 19.9242 18.53 19.9242C18.0586 19.9242 17.6049 19.7349 17.27 19.4L17.21 19.34C16.7278 18.8683 16.0071 18.7377 15.39 19.01C14.7863 19.2676 14.3992 19.8558 14.4 20.51V20.7C14.4 21.1774 14.2104 21.6352 13.8728 21.9728C13.5352 22.3104 13.0774 22.5 12.6 22.5C12.1226 22.5 11.6648 22.3104 11.3272 21.9728C10.9896 21.6352 10.8 21.1774 10.8 20.7V20.6C10.7347 19.9297 10.3154 19.3417 9.69 19.1C9.07288 18.8277 8.35217 18.9583 7.87 19.43L7.81 19.49C7.47507 19.8249 7.02142 20.0142 6.55 20.0142C6.07858 20.0142 5.62493 19.8249 5.29 19.49C4.95507 19.1551 4.76575 18.7014 4.76575 18.23C4.76575 17.7586 4.95507 17.3049 5.29 16.97L5.35 16.91C5.82167 16.4278 5.95233 15.7071 5.68 15.09C5.42241 14.4863 4.83418 14.0992 4.18 14.1H4C3.52261 14.1 3.06477 13.9104 2.72721 13.5728C2.38964 13.2352 2.2 12.7774 2.2 12.3C2.2 11.8226 2.38964 11.3648 2.72721 11.0272C3.06477 10.6896 3.52261 10.5 4 10.5H4.1C4.77029 10.4347 5.35833 10.0154 5.6 9.39C5.87233 8.77288 5.74167 8.05217 5.27 7.57L5.21 7.51C4.87507 7.17507 4.68575 6.72142 4.68575 6.25C4.68575 5.77858 4.87507 5.32493 5.21 4.99C5.54493 4.65507 5.99858 4.46575 6.47 4.46575C6.94142 4.46575 7.39507 4.65507 7.73 4.99L7.79 5.05C8.27217 5.52167 8.99288 5.65233 9.61 5.38H9.7C10.3037 5.12241 10.6908 4.53418 10.69 3.88V3.7C10.69 3.22261 10.8796 2.76477 11.2172 2.42721C11.5548 2.08964 12.0126 1.9 12.49 1.9C12.9674 1.9 13.4252 2.08964 13.7628 2.42721C14.1004 2.76477 14.29 3.22261 14.29 3.7V3.8C14.2892 4.45418 14.6763 5.04241 15.28 5.3C15.8971 5.57233 16.6178 5.44167 17.1 4.97L17.16 4.91C17.4949 4.57507 17.9486 4.38575 18.42 4.38575C18.8914 4.38575 19.3451 4.57507 19.68 4.91C20.0149 5.24493 20.2042 5.69858 20.2042 6.17C20.2042 6.64142 20.0149 7.09507 19.68 7.43L19.62 7.49C19.1483 7.97217 19.0177 8.69288 19.29 9.31V9.4C19.5476 10.0037 20.1358 10.3908 20.79 10.39H21C21.4774 10.39 21.9352 10.5796 22.2728 10.9172C22.6104 11.2548 22.8 11.7126 22.8 12.19C22.8 12.6674 22.6104 13.1252 22.2728 13.4628C21.9352 13.8004 21.4774 13.99 21 13.99H20.9C20.2458 13.9892 19.6576 14.3763 19.4 14.98V15Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconShare = icon(
  <>
    <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8.59 13.51L15.42 17.49" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M15.41 6.51L8.59 10.49" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconQr = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.75" />
    <path d="M14 14H17V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 20H21V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 17V21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="5" y="5" width="3" height="3" fill="currentColor" rx="0.5" />
    <rect x="16" y="5" width="3" height="3" fill="currentColor" rx="0.5" />
    <rect x="5" y="16" width="3" height="3" fill="currentColor" rx="0.5" />
  </>
);

export const IconEdit = icon(
  <>
    <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.5 2.5C18.8978 2.10218 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10218 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10218 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconTrash = icon(
  <>
    <path d="M3 6H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M19 6V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 11V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M14 11V17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconRefresh = icon(
  <>
    <path d="M23 4V10H17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1 20V14H7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9C4.01717 7.56678 4.87913 6.2854 6.01547 5.27543C7.1518 4.26545 8.52547 3.55953 10.0083 3.22836C11.4911 2.89719 13.0348 2.95196 14.4905 3.38714C15.9462 3.82232 17.2648 4.62299 18.32 5.72L23 10M1 14L5.68 18.28C6.73524 19.377 8.05376 20.1777 9.50952 20.6129C10.9653 21.048 12.5089 21.1028 13.9917 20.7716C15.4745 20.4405 16.8482 19.7345 17.9845 18.7246C19.1209 17.7146 19.9828 16.4332 20.49 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/* ─── Finance ───────────────────────────────────────────────────────────── */

export const IconWallet = icon(
  <>
    <path d="M21 4H3C1.89543 4 1 4.89543 1 6V18C1 19.1046 1.89543 20 3 20H21C22.1046 20 23 19.1046 23 18V6C23 4.89543 22.1046 4 21 4Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1 10H23" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="17" cy="15" r="1.5" fill="currentColor" />
  </>
);

export const IconCoin = icon(
  <>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
    <path d="M14.31 8C14.4951 8.45645 14.5417 8.95763 14.4434 9.44087C14.3452 9.92412 14.1066 10.3672 13.7573 10.7136C13.4079 11.0599 12.9629 11.2944 12.4789 11.3882C11.9948 11.4821 11.4939 11.4309 11.04 11.24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M9 8H12.5C12.9596 8 13.4148 8.09053 13.8394 8.26642C14.264 8.44231 14.6499 8.70012 14.9749 9.02513C15.2999 9.35013 15.5577 9.73597 15.7336 10.1606C15.9095 10.5852 16 11.0404 16 11.5C16 11.9596 15.9095 12.4148 15.7336 12.8394C15.5577 13.264 15.2999 13.6499 14.9749 13.9749C14.6499 14.2999 14.264 14.5577 13.8394 14.7336C13.4148 14.9095 12.9596 15 12.5 15H9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M9 8V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 6.5V8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 16V17.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconTrendUp = icon(
  <>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconTrendDown = icon(
  <>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17 18 23 18 23 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChart = icon(
  <>
    <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconChartLine = icon(
  <>
    <path d="M3 3V18C3 18.5523 3.44772 19 4 19H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 14L11 9L14 12L18 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconPercent = icon(
  <>
    <path d="M19 5L5 19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
  </>
);

export const IconLock = icon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 11V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7V11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </>
);

export const IconUnlock = icon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M7 11V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </>
);

export const IconShield = icon(
  <>
    <path d="M12 22C12 22 3 18 3 11V5L12 2L21 5V11C21 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconGift = icon(
  <>
    <polyline points="20 12 20 22 4 22 4 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="7" width="20" height="5" rx="1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="22" x2="12" y2="7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.83696 5.26339 3.20107 5.73223 2.73223C6.20107 2.26339 6.83696 2 7.5 2C10.5 2 12 7 12 7Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.83696 18.7366 3.20107 18.2678 2.73223C17.7989 2.26339 17.163 2 16.5 2C13.5 2 12 7 12 7Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconUsers = icon(
  <>
    <path d="M17 21V19C17 16.7909 15.2091 15 13 15H5C2.79086 15 1 16.7909 1 19V21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
    <path d="M23 21V19C22.9993 17.1137 21.765 15.4496 20 14.87" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M16 3.13C17.7699 3.70638 19.0078 5.37252 19.0078 7.26C19.0078 9.14748 17.7699 10.8136 16 11.39" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

/* ─── Misc ──────────────────────────────────────────────────────────────── */

export const IconGlobe = icon(
  <>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 12H22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M12 2C12 2 8 7 8 12C8 17 12 22 12 22C12 22 16 17 16 12C16 7 12 2 12 2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconExternalLink = icon(
  <>
    <path d="M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 3H21V9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14L21 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconCalendar = icon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M16 2V6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M8 2V6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3 10H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconMpesa = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M7 12H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M8.5 10.5V13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M13 10.5L15 13.5L17 10.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconStar = icon(
  <>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconStarFilled = icon(
  <>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconHelp = icon(
  <>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
    <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
  </>
);

export const IconDownload = icon(
  <>
    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconUpload = icon(
  <>
    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

export const IconDot = icon(
  <>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </>
);

export const IconApi = icon(
  <>
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconAnalysis = icon(
  <>
    <path d="M3 3V18C3 18.5523 3.44772 19 4 19H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="7" y="10" width="3" height="8" rx="1" fill="currentColor" opacity="0.4" />
    <rect x="12" y="6" width="3" height="12" rx="1" fill="currentColor" opacity="0.7" />
    <rect x="17" y="13" width="3" height="5" rx="1" fill="currentColor" opacity="0.4" />
  </>
);

export const IconFlag = icon(
  <>
    <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 22V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </>
);

/* ─── Brand Logo ────────────────────────────────────────────────────────── */

export function IconKryptoKeLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="KryptoKe"
    >
      <defs>
        <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5B4" />
          <stop offset="100%" stopColor="#F0B429" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#brand-grad)" />
      {/* K letterform */}
      <path
        d="M9 7V25M9 17L21 7M9 17L21 25"
        stroke="#080C14"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
