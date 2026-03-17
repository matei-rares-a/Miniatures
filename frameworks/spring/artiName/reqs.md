

# 🚀 **Project: Task Management REST API (Spring Boot + JPA + Security)**

A full CRUD application where users can register/login, create tasks, mark them as done, and filter them.

Perfect for learning:

* Spring Boot
* Spring Web (REST)
* Spring Data JPA (Hibernate)
* Spring Security (JWT recommended)
* Validation
* Error handling
* Optional: Swagger API docs, Docker

---

# 🧱 **Core Features**

### ✅ **User Authentication**

* Register a new user
* Login and get a JWT token
* Only authenticated users can manage tasks
* Each user can only see THEIR tasks

---

### ✅ **Tasks CRUD**

**Fields:**

* id
* title
* description
* dueDate
* status (TODO, IN_PROGRESS, DONE)
* createdAt
* updatedAt
* userId (owner)

**Endpoints:**

* `POST /tasks` – create task
* `GET /tasks` – list my tasks
* `GET /tasks/{id}` – view one
* `PUT /tasks/{id}` – update task
* `DELETE /tasks/{id}` – delete task

---

### ✅ **Filters (Advanced)**

* `/tasks?status=DONE`
* `/tasks?dueBefore=2025-01-01`
* `/tasks?search=shopping`
* Pagination & sorting

---

### Optional Add-ons (choose 1–5 depending on difficulty):

* 📱 Frontend with React or Vue
* 📘 Swagger API docs (springdoc-openapi)
* 🐳 Dockerize the app
* 📨 Send email reminders for due tasks
* 🌐 Deploy to Railway / Render / AWS
* 🔌 WebSockets for live updates
* 🧪 Write unit tests + integration tests

---

# 🗂️ Example Project Structure (Spring Boot)

```
src/
 └── main/java/com/example/tasks
        ├── controller/
        │     TaskController.java
        │     AuthController.java
        ├── service/
        │     TaskService.java
        │     UserService.java
        ├── model/
        │     Task.java
        │     User.java
        ├── repository/
        │     TaskRepository.java
        │     UserRepository.java
        ├── security/
        │     JwtFilter.java
        │     JwtUtils.java
        │     SecurityConfig.java
        └── dto/
              TaskDto.java
              UserDto.java
```

---

# ✨ Want a code starter?

Here is a starter for the **Task entity**:

```java
@Entity
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String description;

    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    private Status status = Status.TODO;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @ManyToOne
    private User user;

    // getters/setters
}
```

Basic **TaskRepository**:

```java
public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByUserId(Long userId);
    List<Task> findByUserIdAndStatus(Long userId, Status status);
}
```

Simple **TaskController** endpoint example:

```java
@RestController
@RequestMapping("/tasks")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @PostMapping
    public Task create(@RequestBody Task task, Authentication auth) {
        return service.createTask(task, auth.getName());
    }

    @GetMapping
    public List<Task> getMyTasks(Authentication auth) {
        return service.getTasks(auth.getName());
    }
}
```

---

