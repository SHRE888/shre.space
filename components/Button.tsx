import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-8 py-3.5 text-[16px] uppercase tracking-[0.4em] font-medium transition-all duration-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed rounded-lg active:scale-[0.97]";
  
  const variants = {
    primary: "border border-gray-200 hover:border-black hover:bg-black hover:text-white text-gray-600 shadow-sm hover:shadow-md",
    secondary: "bg-gray-900 text-white hover:bg-black shadow-md hover:shadow-lg",
    outline: "border border-gray-100 text-gray-500 hover:border-gray-300 hover:text-black hover:bg-gray-50"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
