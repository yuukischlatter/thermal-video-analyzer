{
  "targets": [
    {
      "target_name": "thermal_engine",
      "sources": [
        "binding.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "C:/opencv/build/include",
        "C:/opencv/build/include/opencv2"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "library_dirs": [
        "C:/opencv/build/x64/vc16/lib"
      ],
      "libraries": [
        "-lopencv_world4100",
        "-lopencv_world4100d"
      ],
      "copies": [{
        "destination": "<(module_root_dir)/build/Release/",
        "files": [
          "C:/opencv/build/x64/vc16/bin/opencv_world4100.dll",
          "C:/opencv/build/x64/vc16/bin/opencv_world4100d.dll"
        ]
      }],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "msvs_settings": {
        "VCCLCompilerTool": { 
          "ExceptionHandling": 1,
          "AdditionalIncludeDirectories": [
            "C:/opencv/build/include"
          ]
        },
        "VCLinkerTool": {
          "AdditionalLibraryDirectories": [
            "C:/opencv/build/x64/vc16/lib"
          ]
        }
      },
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "msvs_version": "2022"
        }]
      ]
    }
  ]
}