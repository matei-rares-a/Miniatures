package com.pack.artiName.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BaseController.class)
class BaseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void greetingShouldReturnDefaultMessage() throws Exception {
        mockMvc.perform(get("/g"))
                .andExpect(status().isOk())
                .andExpect(content().string("0Hello, World!"));
    }

    @Test
    void greetingShouldReturnCustomMessage() throws Exception {
        mockMvc.perform(get("/g").param("name", "Alice"))
                .andExpect(status().isOk())
                .andExpect(content().string("0Hello, Alice!"));
    }
}
